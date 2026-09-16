# Spec — Query Language (`js/query-parser.js`)

Pure module: tokenizer → recursive-descent parser → line evaluator.
**No DOM access.** UMD export guard so the same file runs in the browser and in
node (`test/query-tests.mjs` is the automated gate).

## 1. Grammar (EBNF)

```
query      = or_expr , end
or_expr    = and_expr { "OR" , and_expr }
and_expr   = not_expr { [ "AND" ] , not_expr }      ; bare adjacency = implicit AND
not_expr   = "NOT" , not_expr | primary
primary    = phrase | term | "(" , or_expr , ")"
phrase     = '"' , any_char* , '"'                  ; no escaping, no nested quotes (v1)
term       = 1*( non-ws , non-quote , non-paren )   ; must not be an operator token
"AND"/"OR"/"NOT"  = operators matched as WHOLE tokens, any casing (and/And/AND …)
```

Rules:
- Tokens are whitespace-delimited outside quotes.
- A bare token equal to AND/OR/NOT (case-insensitive) is always an **operator**,
  never a literal. To search for the literal word, quote it: `"and"`.
- Implicit AND: `foo bar` ≡ `foo AND bar`; `"a b" c` ≡ phrase(a b) AND term(c).
- Precedence (tightest first): `NOT` > `AND` > `OR`. Parentheses override.
- Double negation is legal: `not not "x"` ≡ `"x"`.

## 2. Matching semantics (per log line)

- Atom evaluation = **case-insensitive substring** test:
  `lineLower.includes(atomLower)`. Grep-like, no word boundaries. Documented
  consequence: `"192.168.1.1"` also matches lines containing `192.168.1.10` —
  narrow by quoting more context (`"192.168.1.1 "` with trailing space).
- `NOT X` excludes any line where X occurs, regardless of other atoms.
- AND = all atoms match; OR = at least one branch matches.
- The evaluator compiles the AST once per search, then runs a single pass over
  the pre-lowercased line array (lowercase copies built at load time).
- Return value: array of **0-based indexes** of matching lines (UI maps index →
  original line number = index + 1).

## 3. Errors (structured, surfaced via `err.invalidQuery` with `{detail}`)

| Condition | `detail` string (English, never translated) |
|---|---|
| Unbalanced quote | `unterminated phrase — check your quotation marks` |
| Empty phrase `""` | `empty phrase — put at least one character between quotes` |
| Unbalanced parenthesis | `unbalanced parenthesis` |
| Leading/dangling/repeated operator | `operator "AND" is missing a search term` (name the operator) |
| Only operators/parens, no terms | `query has no search terms` |

On any error the search **does not run** and the previous view stays untouched.

## 4. Canonical example (product requirement)

Query: `"MID 123456" and "MID 123654" not "192.168.1.1"`
≡ `("MID 123456" AND "MID 123654") AND NOT "192.168.1.1"`
→ shows only lines containing **both** MID phrases and **nowhere** containing
`192.168.1.1`.

## 5. Test fixture (24 lines — identical in node test + docs)

```
 1  2026-09-14T08:00:01Z INFO  svc=auth  session started from 192.168.1.1
 2  2026-09-14T08:00:02Z DEBUG svc=auth  MID 123456 token issued for user=admin
 3  2026-09-14T08:00:03Z INFO  svc=auth  MID 123654 password reset requested from 10.0.0.5
 4  2026-09-14T08:00:04Z WARN  svc=api   MID 123456 retry storm detected client=192.168.1.1
 5  2026-09-14T08:00:05Z ERROR svc=db    MID 123654 deadlock on table=orders host=db-2
 6  2026-09-14T08:00:06Z INFO  svc=api   request completed status=200 path=/health
 7  2026-09-14T08:00:07Z WARN  svc=api   MID 123456 and MID 123654 correlated by trace=t-77
 8  2026-09-14T08:00:08Z ERROR svc=auth  MID 123456 lockout for user=admin from 192.168.1.1
 9  2026-09-14T08:00:09Z INFO  svc=db    backup started job=daily
10  2026-09-14T08:00:10Z DEBUG svc=net   packet loss to 192.168.1.10 interface=eth0
11  2026-09-14T08:00:11Z INFO  svc=api   request completed status=500 path=/orders
12  2026-09-14T08:00:12Z ERROR svc=api   MID 123654 timeout after 30s upstream=payments
13  2026-09-14T08:00:13Z INFO  svc=auth  user=jdoe login success from 172.16.4.9
14  2026-09-14T08:00:14Z WARN  svc=db    slow query 1250ms table=orders id=9988
15  2026-09-14T08:00:15Z INFO  svc=api   request completed status=200 path=/login
16  2026-09-14T08:00:16Z ERROR svc=auth  MID 123456 brute force pattern source=192.168.1.1 count=41
17  2026-09-14T08:00:17Z DEBUG svc=net   arp table updated gateway=192.168.1.1
18  2026-09-14T08:00:18Z INFO  svc=db    vacuum finished freed=340mb
19  2026-09-14T08:00:19Z WARN  svc=api   rate limit approaching client=10.0.0.5
20  2026-09-14T08:00:20Z ERROR svc=db    MID 123456 MID 123654 replication lag 52s host=db-2 via 192.168.1.1
21  2026-09-14T08:00:21Z INFO  svc=auth  session expired user=admin
22  2026-09-14T08:00:22Z DEBUG svc=api   gc pause 45ms gen=1
23  2026-09-14T08:00:23Z ERROR svc=api   MID 123456 circuit breaker open upstream=payments
24  2026-09-14T08:00:24Z INFO  svc=net   link up interface=eth0 speed=10g
```

## 6. Test vectors (line numbers = original 1-based)

| # | Query | Expected lines |
|---|---|---|
| V01 | `"MID 123456"` | 2,4,7,8,16,20,23 |
| V02 | `MID 123456` (bare, implicit AND of MID + 123456) | 2,4,7,8,16,20,23 |
| V03 | `"MID 123456" and "MID 123654"` | 7,20 |
| V04 | **canonical** `"MID 123456" and "MID 123654" not "192.168.1.1"` | 7 |
| V05 | `not "192.168.1.1"` | 2,3,5,6,7,9,11,12,13,14,15,18,19,21,22,23,24 |
| V06 | `"status=200" OR "status=500"` | 6,11,15 |
| V07 | `"svc=db" AND ("deadlock" OR "replication")` | 5,20 |
| V08 | `MID 123456 not auth` | 4,7,20,23 |
| V09 | `mid 123456` (lowercase query) | 2,4,7,8,16,20,23 |
| V10 | `"Status=200"` | 6,15 |
| V11 | `"svc=api" OR "svc=db" AND error` (AND binds tighter) | 4,5,6,7,11,12,15,19,20,22,23 |
| V12 | `("svc=api" OR "svc=db") AND error` | 5,12,20,23 |
| V13 | `"svc=auth" or "svc=db" not error` (= A OR (B AND NOT C)) | 1,2,3,8,9,13,14,16,18,21 |
| V14 | `"MID 123456" not "auth" not "brute"` | 4,7,20,23 |
| V15 | `"192.168.1.1"` (substring trap — line 10 matches via .10) | 1,4,8,10,16,17,20 |
| V16 | `"192.168.1.1 "` (trailing space narrows; only line w/ space after IP) | 16 |
| V17 | `not not "svc=db"` | 5,9,14,18,20 |
| V18 | `"svc=api" "status=200"` (implicit AND) | 6,15 |
| V19 | `"and"` (quoted operator = literal substring) | 7 |
| V20 | `"MID 123456` | ERROR: unterminated phrase |
| V21 | `"" and svc` | ERROR: empty phrase |
| V22 | `("svc=api"` | ERROR: unbalanced parenthesis |
| V23 | `"svc=api" AND` | ERROR: operator "AND" is missing a search term |
| V24 | `AND "svc=api"` | ERROR: operator "AND" is missing a search term |
| V25 | `OR OR` | ERROR: dangling operator / no search terms (implementation picks one, document it) |

UI-level behaviors tested manually (not node): empty/whitespace query with a
loaded file → show all lines, no error; invalid query → error slot filled and
previous view untouched; `?q=` param prefills the input on load.

## 7. Runner contract

`node test/query-tests.mjs` prints one line per vector (`PASS V04 …` /
`FAIL V11 expected [5,12,20,23] got [5,20]`) and exits non-zero on any failure.
The vector table above is the source of truth: if a vector is ever deemed
wrong, fix this spec first, then the code, in the same session.

