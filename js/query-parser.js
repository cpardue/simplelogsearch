// SimpleLogSearch — js/query-parser.js (CHECKLIST 3.1; spec: spec/query-language.md §1–§3)
//
// Pure module: tokenizer → recursive-descent parser → compiled line evaluator.
// No DOM access. UMD export guard so the same file runs in the browser
// (window.QueryParser) and unchanged in node (test/query-tests.mjs — 3.2/3.3).
//
// Grammar (§1):
//   query    = or_expr, end
//   or_expr  = and_expr { "OR", and_expr }
//   and_expr = not_expr { [ "AND" ], not_expr }      ; bare adjacency = implicit AND
//   not_expr = "NOT", not_expr | primary             ; double negation legal
//   primary  = phrase | term | "(" or_expr ")"
//   Operators AND/OR/NOT are matched as WHOLE tokens, any casing. A bare token
//   that is an operator word is ALWAYS an operator, never a literal — quote it
//   to search for the literal word (§1 rules).
//
// API:
//   QueryParser.parseQuery(query)           → AST; throws QueryParseError (exact §3 errors)
//   QueryParser.compile(ast)                → predicate fn(lineLower) → boolean; the AST is
//                                              compiled ONCE per search, then a single pass
//                                              over the pre-lowercased lines runs (§2)
//   QueryParser.run(predicate, linesLower)  → number[] of 0-based matching indexes (§2)
//   QueryParser.search(query, linesLower)   → convenience: parseQuery + compile + run
//   QueryParser.positiveAtoms(ast)          → string[] of pre-lowercased atoms with POSITIVE
//                                              polarity — the live highlight preview's terms
//                                              (ui-spec §4 / B16). AND/OR inherit the parent
//                                              polarity, NOT flips it (double negation ≡
//                                              positive, per §1). Deduped, first-seen order.
//   QueryParser.QueryParseError             → Error subclass; .detail = exact §3 detail string
//
// AST nodes:
//   { type: "ATOM", value }     pre-lowercased text; case-insensitive substring test
//                               lineLower.includes(value) — grep-like, no word boundaries (§2)
//   { type: "AND", children }   all children match
//   { type: "OR",  children }   at least one child matches
//   { type: "NOT", child }      excludes any line where child matches, regardless of other atoms
//
// §3 detail strings (exact, English, never translated):
//   "unterminated phrase — check your quotation marks"
//   "empty phrase — put at least one character between quotes"
//   "unbalanced parenthesis"
//   'operator "AND" is missing a search term'     (AND/OR/NOT, uppercase canonical name)
//   "query has no search terms"                   (empty / whitespace-only query)
// V25 note (spec §6 defers the choice of error to the implementation): `OR OR` reports the
// first error met during parsing — 'operator "OR" is missing a search term' (the
// leading-operator check fires before any whole-query no-terms scan).

(function () {
  "use strict";

  // --- §3 error details (verbatim; surfaced via err.invalidQuery {detail}) -------
  var DETAIL_UNTERMINATED_PHRASE = "unterminated phrase — check your quotation marks";
  var DETAIL_EMPTY_PHRASE = "empty phrase — put at least one character between quotes";
  var DETAIL_UNBALANCED_PAREN = "unbalanced parenthesis";
  var DETAIL_NO_TERMS = "query has no search terms";

  function opMissing(name) { return 'operator "' + name + '" is missing a search term'; }

  function QueryParseError(detail) {
    var err = new Error(detail);
    err.name = "QueryParseError";
    err.detail = detail; // §3: structured error object carried to the UI error slot
    return err;
  }

  // --- Tokenizer (§1) ---------------------------------------------------------------
  // Whitespace-delimited outside quotes; " opens a phrase (no escaping, no nested
  // quotes — the first " closes it); ( / ) are standalone tokens; a bare word equal
  // to AND/OR/NOT in any casing is an operator token, never a literal.

  var OPERATOR_WORDS = { and: "AND", or: "OR", not: "NOT" };
  var WS_RE = /\s/;

  function isTermChar(ch) {
    return !WS_RE.test(ch) && ch !== "\"" && ch !== "(" && ch !== ")";
  }

  function tokenize(input) {
    var tokens = [];
    var i = 0;
    var n = input.length;
    while (i < n) {
      var ch = input[i];
      if (WS_RE.test(ch)) { i += 1; continue; }
      if (ch === "\"") {
        var k = i + 1;
        while (k < n && input[k] !== "\"") k += 1;
        if (k >= n) throw QueryParseError(DETAIL_UNTERMINATED_PHRASE); // V20
        tokens.push({ type: "PHRASE", value: input.slice(i + 1, k) }); // "" → parse-time error (V21)
        i = k + 1;
      } else if (ch === "(") {
        tokens.push({ type: "LPAREN" });
        i += 1;
      } else if (ch === ")") {
        tokens.push({ type: "RPAREN" });
        i += 1;
      } else {
        var j = i;
        while (j < n && isTermChar(input[j])) j += 1;
        var word = OPERATOR_WORDS[input.slice(i, j).toLowerCase()];
        tokens.push(word ? { type: word } : { type: "TERM", value: input.slice(i, j) });
        i = j;
      }
    }
    return tokens;
  }

  // --- Recursive-descent parser (§1 precedence: NOT > AND > OR) ---------------------
  function parseQuery(query) {
    var tokens = tokenize(String(query));
    if (tokens.length === 0) throw QueryParseError(DETAIL_NO_TERMS); // empty / whitespace-only
    var pos = 0;

    function peek() { return tokens[pos] || null; }
    function next() { return tokens[pos++] || null; }
    function startsPrimary(t) {
      return t !== null &&
        (t.type === "NOT" || t.type === "TERM" || t.type === "PHRASE" || t.type === "LPAREN");
    }

    function parseOr() {
      var children = [parseAnd()];
      while (peek() && peek().type === "OR") {
        next();
        if (!startsPrimary(peek())) throw QueryParseError(opMissing("OR")); // dangling/repeated OR (§3)
        children.push(parseAnd()); // each OR branch is a full and-list (§1 grammar)
      }
      return children.length === 1 ? children[0] : { type: "OR", children: children };
    }

    function parseAnd() {
      var children = [parseNot()];
      for (;;) {
        var t = peek();
        if (t && t.type === "AND") {
          next();
          if (!startsPrimary(peek())) throw QueryParseError(opMissing("AND")); // dangling/repeated AND (§3)
          children.push(parseNot());
        } else if (startsPrimary(t)) {
          children.push(parseNot()); // bare adjacency = implicit AND (§1)
        } else {
          break; // OR / RPAREN / end leave the and-list
        }
      }
      return children.length === 1 ? children[0] : { type: "AND", children: children };
    }

    function parseNot() {
      if (peek() && peek().type === "NOT") {
        next();
        if (!startsPrimary(peek())) throw QueryParseError(opMissing("NOT"));
        return { type: "NOT", child: parseNot() }; // recursion → double negation legal (§1)
      }
      return parsePrimary();
    }

    function parsePrimary() {
      var t = next();
      if (t && t.type === "TERM") return { type: "ATOM", value: t.value.toLowerCase() };
      if (t && t.type === "PHRASE") {
        if (t.value === "") throw QueryParseError(DETAIL_EMPTY_PHRASE); // V21
        return { type: "ATOM", value: t.value.toLowerCase() };
      }
      if (t && t.type === "LPAREN") {
        var expr = parseOr();
        var close = next();
        if (!close || close.type !== "RPAREN") throw QueryParseError(DETAIL_UNBALANCED_PAREN); // V22
        return expr;
      }
      if (t && (t.type === "AND" || t.type === "OR")) {
        throw QueryParseError(opMissing(t.type)); // leading/repeated operator (§3) — V24, V25
      }
      if (t && t.type === "NOT") throw QueryParseError(opMissing("NOT")); // defensive; parseNot owns NOT
      throw QueryParseError(DETAIL_UNBALANCED_PAREN); // stray ")" or bare end-of-input where a term is required
    }

    var ast = parseOr();
    if (peek()) throw QueryParseError(DETAIL_UNBALANCED_PAREN); // only a stray ")" can survive here
    return ast;
  }

  // --- Compiled evaluator (§2) -------------------------------------------------------
  // compile() turns the AST into plain closures over pre-lowercased atoms. The UI
  // compiles once per search, then run() does a single pass over linesLower.

  function buildNode(node) {
    switch (node.type) {
      case "ATOM": {
        var needle = node.value;
        return function (lineLower) { return lineLower.includes(needle); };
      }
      case "AND": {
        var andParts = node.children.map(buildNode);
        if (andParts.length === 1) return andParts[0];
        return function (lineLower) {
          for (var i = 0; i < andParts.length; i += 1) if (!andParts[i](lineLower)) return false;
          return true;
        };
      }
      case "OR": {
        var orParts = node.children.map(buildNode);
        if (orParts.length === 1) return orParts[0];
        return function (lineLower) {
          for (var i = 0; i < orParts.length; i += 1) if (orParts[i](lineLower)) return true;
          return false;
        };
      }
      case "NOT": {
        var notChild = buildNode(node.child);
        return function (lineLower) { return !notChild(lineLower); };
      }
    }
    throw new Error("query-parser: unknown AST node type"); // unreachable from parseQuery
  }

  function compile(ast) {
    return buildNode(ast); // one predicate for the whole search (§2)
  }

  function run(predicate, linesLower) {
    var indexes = [];
    for (var i = 0; i < linesLower.length; i += 1) {
      if (predicate(linesLower[i])) indexes.push(i);
    }
    return indexes; // 0-based; UI maps index → original line number = index + 1 (§2)
  }

  function search(query, linesLower) {
    return run(compile(parseQuery(query)), linesLower);
  }

  // --- positiveAtoms (ui-spec §4 / B16 — live highlight preview) ------------------------
  // Walks the AST and returns the atoms whose effective polarity is POSITIVE:
  // AND/OR children inherit the parent's polarity, NOT flips it — so
  // `not not "x"` ≡ `"x"` (query-language §1 double negation) yields ["x"], while
  // a bare `not "x"` yields [] (a fully negative query highlights nothing).
  // Atoms are pre-lowercased; the UI matches them case-insensitively against the
  // original line text. Deduped, first-seen order. Pure — no DOM access.

  function positiveAtoms(ast) {
    var out = [];
    var seen = {};
    (function walk(node, positive) {
      if (!node || typeof node !== "object") return;
      switch (node.type) {
        case "ATOM":
          if (positive && node.value && !seen[node.value]) {
            seen[node.value] = true;
            out.push(node.value);
          }
          break;
        case "AND":
        case "OR":
          for (var i = 0; i < node.children.length; i += 1) walk(node.children[i], positive);
          break;
        case "NOT":
          walk(node.child, !positive); // flips polarity — double negation restores it (§1)
          break;
      }
    })(ast, true);
    return out;
  }

  var QueryParser = {
    parseQuery: parseQuery,
    compile: compile,
    run: run,
    search: search,
    positiveAtoms: positiveAtoms,
    QueryParseError: QueryParseError,
  };

  // --- UMD export (same guard pattern as js/i18n.js) ---------------------------------
  if (typeof window !== "undefined") window.QueryParser = QueryParser;
  if (typeof module !== "undefined" && module.exports) module.exports = QueryParser;
})();

