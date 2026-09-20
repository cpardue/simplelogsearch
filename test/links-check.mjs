// SimpleLogSearch — test/links-check.mjs (CHECKLIST 6.10; spec: spec/seo-adsense.md §2)
//
// Automated node gate for the 6 static pages:
//   Part 1 — every internal href (<a>/<link>, double-quoted attributes) with its
//            query/fragment stripped must resolve to a local file in this repo tree.
//            Same-origin absolute URLs (https://simplelogsearch.com/...) map onto the
//            tree; external origins and non-URL schemes are skipped as out of scope.
//   Part 2 — every JSON-LD block must parse as JSON, carry @context schema.org, match
//            the §2 page-table @type set for its page, and satisfy the §2 required
//            fields: WebSite (name/url + potentialAction SearchAction whose target is
//            exactly https://simplelogsearch.com/?q={search_term_string}),
//            SoftwareApplication (DeveloperApplication/Web, offers price 0 USD, and NO
//            aggregateRating), WebPage/AboutPage (name + on-site url), FAQPage (10
//            entries on index / 14 on faq, each a Question with an Answer text),
//            Article (headline + author Person "Chris Pardue" + dateModified),
//            BreadcrumbList (≥ 2 ListItem with position/name/on-site item URL),
//            Person (name "Chris Pardue", sameAs includes cehstudy.com/about/).
// Run from workspace root or repo root:
//   node simplelogsearch/test/links-check.mjs
//   node test/links-check.mjs
// Prints one PASS/FAIL line per check plus a final RESULT summary; exits non-zero on
// any failure. The §2 table in spec/seo-adsense.md is the source of truth: if it ever
// disagrees with the pages, fix the spec first (one-line rationale), then the pages
// and this file, in the same session (CHECKLIST protocol 8).

import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const SITE_HOST = "simplelogsearch.com";
const SITE_ORIGIN = "https://" + SITE_HOST;
const SEARCH_ACTION_URL = "https://simplelogsearch.com/?q={search_term_string}";

// §2 page table (spec/seo-adsense.md) — source of truth for @type sets and FAQ counts.
const PAGES = [
  { file: "index.html", types: ["WebSite", "SoftwareApplication", "WebPage", "FAQPage"], faqCount: 10 },
  { file: "query-syntax/index.html", types: ["Article", "BreadcrumbList"] },
  { file: "how-to-search-logs/index.html", types: ["Article", "BreadcrumbList"] },
  { file: "faq/index.html", types: ["WebPage", "FAQPage", "BreadcrumbList"], faqCount: 14 },
  { file: "about/index.html", types: ["AboutPage", "Person", "BreadcrumbList"] },
  { file: "privacy-policy/index.html", types: ["WebPage", "BreadcrumbList"] },
];

let pass = 0;
let fail = 0;
function check(cond, label) {
  if (cond) {
    pass++;
    console.log("PASS " + label);
  } else {
    fail++;
    console.log("FAIL " + label);
  }
  return cond;
}
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const readPage = (file) => readFileSync(path.join(root, file), "utf8");

// --- Part 1: internal href resolution -------------------------------------------
// Maps an href to a repo-relative POSIX path to verify, or null when the reference is
// external (skipped). Query strings and fragments are stripped before resolution.
function resolveRef(href, pageFile) {
  const clean = href.split("#", 1)[0].split("?", 1)[0];
  if (clean === "") return pageFile; // fragment-only (#anchor) → the page itself
  let p;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
    let u;
    try {
      u = new URL(clean);
    } catch {
      return null; // non-URL scheme (mailto:, tel:, ...) → out of scope
    }
    const host = u.hostname.toLowerCase();
    if (host !== SITE_HOST && host !== "www." + SITE_HOST) return null; // external origin → out of scope
    p = decodeURIComponent(u.pathname).replace(/^\//, ""); // same-origin absolute URL → tree path
  } else if (clean.startsWith("/")) {
    p = clean.slice(1);
  } else {
    p = path.posix.join(path.posix.dirname(pageFile), decodeURIComponent(clean));
  }
  p = path.posix.normalize(p);
  if (p === "" || p === ".") p = "index.html"; // site root
  if (p.endsWith("/")) p += "index.html"; // directory URLs serve index.html
  return p;
}

let refsChecked = 0;
let refsBroken = 0;
for (const page of PAGES) {
  const html = readPage(page.file);
  const hrefs = [...html.matchAll(/<([a-z][a-z0-9]*)[^>]*\shref="([^"]*)"/gi)].map((m) => m[2]);
  let internal = 0;
  let broken = 0;
  for (const href of hrefs) {
    const local = resolveRef(href, page.file);
    if (local === null) continue; // external reference — not an internal href
    if (local.startsWith("..")) {
      broken++;
      refsBroken++;
      check(false, `links ${page.file}: "${href}" escapes the repo tree`);
      continue;
    }
    internal++;
    const abs = path.join(root, ...local.split("/"));
    if (existsSync(abs) && statSync(abs).isFile()) {
      check(true, `links ${page.file}: "${href}" → ${local}`);
    } else {
      broken++;
      refsBroken++;
      check(false, `links ${page.file}: "${href}" → ${local} (missing local file)`);
    }
  }
  refsChecked += internal;
  check(broken === 0 && hrefs.length > 0,
    `links ${page.file}: ${internal} of ${hrefs.length} href attrs are internal, 0 broken`);
}

// --- Part 2: JSON-LD validation (spec §2) ----------------------------------------
function fieldChecks(b, page, label) {
  switch (b["@type"]) {
    case "WebSite":
      check(isNonEmptyString(b.name), `${label} WebSite: name`);
      check(b.url === SITE_ORIGIN + "/", `${label} WebSite: url == ${SITE_ORIGIN}/`);
      {
        const pas = (Array.isArray(b.potentialAction) ? b.potentialAction : [b.potentialAction]).filter(Boolean);
        const search = pas.find((a) => a["@type"] === "SearchAction");
        check(Boolean(search), `${label} WebSite: potentialAction is a SearchAction`);
        if (search) {
          const t = search.target;
          const url = typeof t === "string" ? t : t && (t.urlTemplate || t.url);
          check(url === SEARCH_ACTION_URL, `${label} WebSite: SearchAction target == ${SEARCH_ACTION_URL}`);
        }
      }
      break;
    case "SoftwareApplication":
      check(b.applicationCategory === "DeveloperApplication", `${label} SoftwareApplication: applicationCategory DeveloperApplication`);
      check(b.operatingSystem === "Web", `${label} SoftwareApplication: operatingSystem Web`);
      {
        const o = Array.isArray(b.offers) ? b.offers[0] : b.offers;
        check(o && Number(o.price) === 0 && o.priceCurrency === "USD", `${label} SoftwareApplication: offers price 0 USD`);
      }
      check(!("aggregateRating" in b), `${label} SoftwareApplication: no aggregateRating (spec §2 — no fake reviews)`);
      break;
    case "WebPage":
    case "AboutPage":
      check(isNonEmptyString(b.name), `${label} ${b["@type"]}: name`);
      check(typeof b.url === "string" && b.url.startsWith(SITE_ORIGIN), `${label} ${b["@type"]}: on-site url`);
      break;
    case "FAQPage":
      check(Array.isArray(b.mainEntity) && b.mainEntity.length === page.faqCount,
        `${label} FAQPage: mainEntity has exactly ${page.faqCount} entries (spec §2)`);
      (Array.isArray(b.mainEntity) ? b.mainEntity : []).forEach((q, i) => {
        const a = q.acceptedAnswer;
        check(q["@type"] === "Question" && isNonEmptyString(q.name) &&
          a && a["@type"] === "Answer" && isNonEmptyString(a.text),
          `${label} FAQPage[${i}]: Question "${(q.name || "").slice(0, 48)}…" + Answer text`);
      });
      break;
    case "Article":
      check(isNonEmptyString(b.headline), `${label} Article: headline`);
      {
        const a = Array.isArray(b.author) ? b.author[0] : b.author;
        check(a && a["@type"] === "Person" && a.name === "Chris Pardue", `${label} Article: author Person "Chris Pardue"`);
      }
      check(isNonEmptyString(b.dateModified), `${label} Article: dateModified`);
      break;
    case "BreadcrumbList":
      check(Array.isArray(b.itemListElement) && b.itemListElement.length >= 2,
        `${label} BreadcrumbList: ≥ 2 itemListElement entries`);
      (Array.isArray(b.itemListElement) ? b.itemListElement : []).forEach((it, i) => {
        check(it["@type"] === "ListItem" && Number(it.position) >= 1 && isNonEmptyString(it.name) &&
          typeof it.item === "string" && it.item.startsWith(SITE_ORIGIN),
          `${label} BreadcrumbList[${i}]: ListItem position/name/on-site item`);
      });
      break;
    case "Person":
      check(b.name === "Chris Pardue", `${label} Person: name "Chris Pardue"`);
      {
        const sameAs = Array.isArray(b.sameAs) ? b.sameAs : [b.sameAs];
        check(sameAs.includes("https://cehstudy.com/about/"), `${label} Person: sameAs includes cehstudy.com/about/`);
      }
      break;
  }
}

let jsonldBlocks = 0;
for (const page of PAGES) {
  const html = readPage(page.file);
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const label = `jsonld ${page.file}`;
  if (blocks.length === 0) {
    check(false, `${label}: no JSON-LD blocks found (spec §2 requires the page-table set)`);
    continue;
  }
  const parsed = [];
  blocks.forEach((m, i) => {
    try {
      parsed.push(JSON.parse(m[1]));
      check(true, `${label} block ${i}: parses as JSON`);
    } catch (e) {
      check(false, `${label} block ${i}: JSON parse — ${e.message}`);
    }
  });
  jsonldBlocks += parsed.length;
  const got = parsed.map((b) => b["@type"]).sort().join(",");
  const want = [...page.types].sort().join(",");
  check(parsed.length === page.types.length && got === want,
    `${label}: @type set {${got}} matches spec §2 row {${want}}`);
  for (const b of parsed) {
    check(b["@context"] === "https://schema.org", `${label} ${b["@type"]}: @context schema.org`);
    fieldChecks(b, page, label);
  }
}

console.log(`RESULT: ${refsChecked}/${refsChecked + refsBroken} internal hrefs resolve to local files (` +
  (refsBroken ? refsBroken + " BROKEN" : "0 broken") + `); ` +
  `${jsonldBlocks} JSON-LD blocks parsed; ${pass} passed / ${fail} failed checks — ` +
  (fail ? "GATE FAILED" : "all JSON-LD valid per spec §2"));
process.exit(fail ? 1 : 0);
