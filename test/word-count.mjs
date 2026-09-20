// SimpleLogSearch — test/word-count.mjs (CHECKLIST 6.11; spec: spec/seo-adsense.md §1)
//
// Word-count audit gate for the 6 static pages. For each page: strip <script>
// and <style> blocks, HTML comments, and all tags (so attribute values never
// count), then count whitespace-separated words in the remaining visible text.
// Each page must meet or exceed its spec/seo-adsense.md §1 floor ("word targets
// are floors"): index 900 | query-syntax 950 | how-to-search-logs 1000 |
// faq 600 | about 350 | privacy-policy 450.
// Run from workspace root or repo root:
//   node simplelogsearch/test/word-count.mjs
//   node test/word-count.mjs
// Prints one PASS/FAIL line per page plus a summary table; exits non-zero on
// any failure. If a page ever falls below its §1 floor, fix the page in the same
// session — the spec is source of truth (CHECKLIST protocol 8).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// §1 floors (spec/seo-adsense.md) — source of truth.
const PAGES = [
  { file: "index.html", floor: 900 },                        // §1.1 (~900 w in the collapsed article)
  { file: "query-syntax/index.html", floor: 950 },           // §1.2
  { file: "how-to-search-logs/index.html", floor: 1000 },    // §1.3
  { file: "faq/index.html", floor: 600 },                    // §1.4
  { file: "about/index.html", floor: 350 },                  // §1.5
  { file: "privacy-policy/index.html", floor: 450 },         // §1.6
];

function visibleWords(html) {
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "\u0000") // hold &amp; last so it cannot double-decode &amp;lt; etc.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\u0000/g, "&");
  return s.split(/\s+/).filter(Boolean).length;
}

let allPass = true;
const rows = [];
for (const page of PAGES) {
  const html = readFileSync(path.join(root, page.file), "utf8");
  const words = visibleWords(html);
  const ok = words >= page.floor;
  allPass = allPass && ok;
  rows.push([page.file, words, page.floor]);
  console.log(
    (ok ? "PASS " : "FAIL ") +
      `${page.file}: ${words} words (spec §1 floor ${page.floor})${ok ? "" : " — BELOW FLOOR"}`
  );
}

console.log("");
const w = Math.max(...rows.map((r) => r[0].length));
console.log("page".padEnd(w) + " words".padStart(7) + " floor".padStart(7) + "  status");
for (const [f, wc, fl] of rows) {
  console.log(f.padEnd(w) + String(wc).padStart(7) + String(fl).padStart(7) + "  " + (wc >= fl ? "PASS" : "FAIL"));
}
console.log(
  allPass
    ? "\nRESULT: all 6 pages meet or exceed their spec §1 word floors"
    : "\nRESULT: FAIL — at least one page is below its spec §1 word floor"
);
process.exitCode = allPass ? 0 : 1;