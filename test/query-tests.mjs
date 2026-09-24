// SimpleLogSearch — test/query-tests.mjs (CHECKLIST 3.2; spec: spec/query-language.md §5–§7)
//
// Automated node gate for js/query-parser.js (behavior per spec §1–§4, vectors per §6).
// Run from workspace root or repo root:
//   node simplelogsearch/test/query-tests.mjs
//   node test/query-tests.mjs
//
// Contract (spec §7): prints one line per vector —
//   PASS V04 "MID 123456" and "MID 123654" not "192.168.1.1" → [7]
//   FAIL V11 expected [5,12,20,23] got [5,20]
// — plus one pre-flight fixture line and a final RESULT summary; exits non-zero
// on any failure. The §6 vector table is the source of truth: if a vector is
// ever deemed wrong, fix spec/query-language.md first (one-line rationale),
// then the parser and this file, in the same session.
//
// V25 note (spec §6 defers the exact error to the implementation): `OR OR` is
// encoded with the implementation's documented choice —
// 'operator "OR" is missing a search term' (see js/query-parser.js header).

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const QueryParser = require(path.join(here, "..", "js", "query-parser.js"));

// --- Fixture (spec §5 — 24 lines, identical in node test + docs) -------------------
const FIXTURE = [
  "2026-09-14T08:00:01Z INFO  svc=auth  session started from 192.168.1.1",
  "2026-09-14T08:00:02Z DEBUG svc=auth  MID 123456 token issued for user=admin",
  "2026-09-14T08:00:03Z INFO  svc=auth  MID 123654 password reset requested from 10.0.0.5",
  "2026-09-14T08:00:04Z WARN  svc=api   MID 123456 retry storm detected client=192.168.1.1",
  "2026-09-14T08:00:05Z ERROR svc=db    MID 123654 deadlock on table=orders host=db-2",
  "2026-09-14T08:00:06Z INFO  svc=api   request completed status=200 path=/health",
  "2026-09-14T08:00:07Z WARN  svc=api   MID 123456 and MID 123654 correlated by trace=t-77",
  "2026-09-14T08:00:08Z ERROR svc=auth  MID 123456 lockout for user=admin from 192.168.1.1",
  "2026-09-14T08:00:09Z INFO  svc=db    backup started job=daily",
  "2026-09-14T08:00:10Z DEBUG svc=net   packet loss to 192.168.1.10 interface=eth0",
  "2026-09-14T08:00:11Z INFO  svc=api   request completed status=500 path=/orders",
  "2026-09-14T08:00:12Z ERROR svc=api   MID 123654 timeout after 30s upstream=payments",
  "2026-09-14T08:00:13Z INFO  svc=auth  user=jdoe login success from 172.16.4.9",
  "2026-09-14T08:00:14Z WARN  svc=db    slow query 1250ms table=orders id=9988",
  "2026-09-14T08:00:15Z INFO  svc=api   request completed status=200 path=/login",
  "2026-09-14T08:00:16Z ERROR svc=auth  MID 123456 brute force pattern source=192.168.1.1 count=41",
  "2026-09-14T08:00:17Z DEBUG svc=net   arp table updated gateway=192.168.1.1",
  "2026-09-14T08:00:18Z INFO  svc=db    vacuum finished freed=340mb",
  "2026-09-14T08:00:19Z WARN  svc=api   rate limit approaching client=10.0.0.5",
  "2026-09-14T08:00:20Z ERROR svc=db    MID 123456 MID 123654 replication lag 52s host=db-2 via 192.168.1.1",
  "2026-09-14T08:00:21Z INFO  svc=auth  session expired user=admin",
  "2026-09-14T08:00:22Z DEBUG svc=api   gc pause 45ms gen=1",
  "2026-09-14T08:00:23Z ERROR svc=api   MID 123456 circuit breaker open upstream=payments",
  "2026-09-14T08:00:24Z INFO  svc=net   link up interface=eth0 speed=10g",
];

// --- Vectors (spec §6 — expected lines are original 1-based numbers) ----------------
// Success vector: { id, query, expect: [line, ...], anyOf?: true } — run through
//   searchWithFallback; `anyOf: true` additionally asserts fallback === true (strict
//   result empty); every unmarked success vector asserts fallback === false.
// Error vector:   { id, query, expectError: <exact §3 detail string> }
const VECTORS = [
  { id: "V01", query: "\"MID 123456\"", expect: [2, 4, 7, 8, 16, 20, 23] },
  { id: "V02", query: "MID 123456", expect: [2, 4, 7, 8, 16, 20, 23] }, // bare, implicit AND of MID + 123456
  { id: "V03", query: "\"MID 123456\" and \"MID 123654\"", expect: [7, 20] },
  { id: "V04", query: "\"MID 123456\" and \"MID 123654\" not \"192.168.1.1\"", expect: [7] }, // canonical (§4)
  { id: "V05", query: "not \"192.168.1.1\"", expect: [2, 3, 5, 6, 7, 9, 11, 12, 13, 14, 15, 18, 19, 21, 22, 23, 24] },
  { id: "V06", query: "\"status=200\" OR \"status=500\"", expect: [6, 11, 15] },
  { id: "V07", query: "\"svc=db\" AND (\"deadlock\" OR \"replication\")", expect: [5, 20] },
  { id: "V08", query: "MID 123456 not auth", expect: [4, 7, 20, 23] },
  { id: "V09", query: "mid 123456", expect: [2, 4, 7, 8, 16, 20, 23] }, // lowercase query
  { id: "V10", query: "\"Status=200\"", expect: [6, 15] },
  { id: "V11", query: "\"svc=api\" OR \"svc=db\" AND error", expect: [4, 5, 6, 7, 11, 12, 15, 19, 20, 22, 23] }, // AND binds tighter
  { id: "V12", query: "(\"svc=api\" OR \"svc=db\") AND error", expect: [5, 12, 20, 23] },
  { id: "V13", query: "\"svc=auth\" or \"svc=db\" not error", expect: [1, 2, 3, 8, 9, 13, 14, 16, 18, 21] }, // = A OR (B AND NOT C)
  { id: "V14", query: "\"MID 123456\" not \"auth\" not \"brute\"", expect: [4, 7, 20, 23] },
  { id: "V15", query: "\"192.168.1.1\"", expect: [1, 4, 8, 10, 16, 17, 20] }, // substring trap — line 10 matches via .10
  { id: "V16", query: "\"192.168.1.1 \"", expect: [16] }, // trailing space narrows
  { id: "V17", query: "not not \"svc=db\"", expect: [5, 9, 14, 18, 20] },
  { id: "V18", query: "\"svc=api\" \"status=200\"", expect: [6, 15] }, // implicit AND
  { id: "V19", query: "\"and\"", expect: [7] }, // quoted operator = literal substring
  { id: "V20", query: "\"MID 123456", expectError: "unterminated phrase — check your quotation marks" },
  { id: "V21", query: "\"\" and svc", expectError: "empty phrase — put at least one character between quotes" },
  { id: "V22", query: "(\"svc=api\"", expectError: "unbalanced parenthesis" },
  { id: "V23", query: "\"svc=api\" AND", expectError: 'operator "AND" is missing a search term' },
  { id: "V24", query: "AND \"svc=api\"", expectError: 'operator "AND" is missing a search term' },
  { id: "V25", query: "OR OR", expectError: 'operator "OR" is missing a search term' }, // impl choice per §6 note
  // --- Zero-hit AND fallback (spec §2; B17) — anyOf vectors assert the fallback flag ---
  { id: "V26", query: "\"backup\" AND \"deadlock\"", expect: [5, 9], anyOf: true },
  { id: "V27", query: "\"status=200\" AND backup NOT auth", expect: [6, 9, 15], anyOf: true }, // NOT stays a whole-line exclusion
  { id: "V28", query: "\"zebra\" AND \"quokka\"", expect: [] }, // both modes empty — no fallback
  { id: "V29", query: "not \"2026\" not \"svc\"", expect: [] }, // all-negative AND — nothing to loosen
];

// --- Highlight-preview atoms (spec/ui-spec.md §4 / B16; QueryParser.positiveAtoms) -----
// Positive-atom extraction for the live highlight preview: AND/OR inherit the parent's
// polarity, NOT flips it (double negation restores positive — query-language §1).
// Expected arrays = pre-lowercased, deduped, first-seen order. Parse-error queries must
// never reach positiveAtoms (the UI parses first) — so no error vectors here.
const ATOM_VECTORS = [
  { id: "A01", query: "\"MID 123456\"", expectAtoms: ["mid 123456"] },
  { id: "A02", query: "MID 123456", expectAtoms: ["mid", "123456"] }, // bare implicit AND
  { id: "A03", query: "\"MID 123456\" and \"MID 123654\" not \"192.168.1.1\"", expectAtoms: ["mid 123456", "mid 123654"] }, // canonical §4 — NOT excluded
  { id: "A04", query: "\"status=200\" OR \"status=500\"", expectAtoms: ["status=200", "status=500"] },
  { id: "A05", query: "not not \"svc=db\"", expectAtoms: ["svc=db"] }, // double negation ≡ positive
  { id: "A06", query: "\"and\"", expectAtoms: ["and"] }, // quoted operator = literal (V19)
  { id: "A07", query: "\"MID 123456\" OR \"MID 123456\"", expectAtoms: ["mid 123456"] }, // dedupe
  { id: "A08", query: "not \"svc=db\"", expectAtoms: [] }, // fully negative → nothing to highlight
];

// --- Pre-flight: fixture = exactly 24 lines, verbatim vs spec/query-language.md §5 --
function fmt(lines) { return "[" + lines.join(",") + "]"; }

let fixtureBad = false;
if (FIXTURE.length !== 24) {
  console.log("FAIL FIXTURE expected 24 lines, embedded " + FIXTURE.length);
  fixtureBad = true;
} else {
  let specLines = null;
  try {
    const spec = readFileSync(path.join(here, "..", "spec", "query-language.md"), "utf8");
    const start = spec.indexOf("## 5.");
    const open = start === -1 ? -1 : spec.indexOf("```", start);
    const close = open === -1 ? -1 : spec.indexOf("```", open + 3);
    if (start !== -1 && open !== -1 && close !== -1) {
      specLines = spec.slice(open + 3, close)
        .split(/\r?\n/)
        .filter((l) => l.trim() !== "")
        .map((l) => l.replace(/^\s*\d+\s{2}/, "")); // strip the " N  " line-number prefix
    }
  } catch (_) { /* spec unreadable → fall through to fixtureBad */ }
  if (!specLines || specLines.length !== 24) {
    console.log("FAIL FIXTURE could not read the 24-line fixture from spec/query-language.md §5");
    fixtureBad = true;
  } else {
    let drift = 0;
    for (let i = 0; i < 24; i += 1) if (FIXTURE[i] !== specLines[i]) drift += 1;
    if (drift === 0) {
      console.log("PRE  fixture: 24/24 lines verbatim vs spec/query-language.md §5");
    } else {
      console.log("FAIL FIXTURE " + drift + " of 24 embedded lines differ from spec/query-language.md §5");
      fixtureBad = true;
    }
  }
}
if (fixtureBad) {
  console.log("RESULT: 0/" + VECTORS.length + " PASS — fixture pre-flight failed, vectors not run");
  process.exit(1);
}

// --- Vector run (§2: evaluator over pre-lowercased lines; index + 1 = original #) ---
const linesLower = FIXTURE.map((l) => l.toLowerCase());
let vecFailures = 0;

for (const v of VECTORS) {
  if (v.expectError !== undefined) {
    try {
      const got = QueryParser.search(v.query, linesLower).map((i) => i + 1);
      console.log("FAIL " + v.id + " expected ERROR (" + v.expectError + ") got " + fmt(got));
      vecFailures += 1;
    } catch (err) {
      if (err && err.name === "QueryParseError" && err.detail === v.expectError) {
        console.log("PASS " + v.id + " " + JSON.stringify(v.query) + " → ERROR (" + err.detail + ")");
      } else {
        const got = err && typeof err.detail === "string" ? err.detail : String(err);
        console.log("FAIL " + v.id + " expected ERROR (" + v.expectError + ") got ERROR (" + got + ")");
        vecFailures += 1;
      }
    }
  } else {
    try {
      const res = QueryParser.searchWithFallback(v.query, linesLower);
      const got = res.indexes.map((i) => i + 1);
      const same = v.expect.length === got.length && v.expect.every((n, i) => n === got[i]);
      const flagOk = (v.anyOf === true) === (res.fallback === true);
      if (same && flagOk) {
        console.log("PASS " + v.id + " " + JSON.stringify(v.query) + (res.fallback ? " → anyOf fallback " : " → ") + fmt(got));
      } else {
        console.log("FAIL " + v.id + " expected " + fmt(v.expect) + (v.anyOf ? " [anyOf]" : "") + " got " + fmt(got) + (res.fallback ? " [fallback]" : "") + (flagOk ? "" : " (fallback flag mismatch)"));
        vecFailures += 1;
      }
    } catch (err) {
      const detail = err && typeof err.detail === "string" ? err.detail : String(err);
      console.log("FAIL " + v.id + " expected " + fmt(v.expect) + " got ERROR (" + detail + ")");
      vecFailures += 1;
    }
  }
}

// --- Highlight-atom run (ui-spec §4 / B16) ----------------------------------------------
let atomFailures = 0;
for (const v of ATOM_VECTORS) {
  let got, errDetail = null;
  try {
    got = QueryParser.positiveAtoms(QueryParser.parseQuery(v.query));
  } catch (err) {
    errDetail = err && typeof err.detail === "string" ? err.detail : String(err);
  }
  if (errDetail !== null) {
    console.log("FAIL " + v.id + " expected atoms got ERROR (" + errDetail + ")");
    atomFailures += 1;
  } else {
    const same = v.expectAtoms.length === got.length && v.expectAtoms.every((a, i) => a === got[i]);
    if (same) {
      console.log("PASS " + v.id + " " + JSON.stringify(v.query) + " → atoms " + fmt(got));
    } else {
      console.log("FAIL " + v.id + " expected atoms " + fmt(v.expectAtoms) + " got " + fmt(got));
      atomFailures += 1;
    }
  }
}

const totalFails = vecFailures + atomFailures;
if (totalFails === 0) {
  console.log("RESULT: " + VECTORS.length + "/" + VECTORS.length + " search vectors + " + ATOM_VECTORS.length + "/" + ATOM_VECTORS.length + " atom vectors PASS (query-language §6 + ui-spec B16)");
} else {
  console.log("RESULT: " + (VECTORS.length - vecFailures) + "/" + VECTORS.length + " search + " + (ATOM_VECTORS.length - atomFailures) + "/" + ATOM_VECTORS.length + " atom PASS — " + totalFails + " vector(s) FAILED");
}
process.exitCode = totalFails === 0 ? 0 : 1;
