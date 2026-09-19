# Spec — SEO / Google Indexability + AdSense Thin-Content Strategy

Base: `https://simplelogsearch.com/` (dedicated-domain project site, locked 2026-09-19 per CHECKLIST 7.4; old subpath URLs 301 here).
Anti-thin-content doctrine: **six genuinely useful pages, ~4,300 original
words total, real author, visible (not just JSON-LD) FAQ, privacy policy, no
templated doorway content.** Content stays English-only (i18n is UI-only by
decision) → single canonical URL per page, no hreflang alternates beyond the
`en-us`/`x-default` pattern cehstudy uses.

## 1. Page inventory & content outlines (word targets are floors)

### 1.1 `index.html` — the app + ~900 words below the fold
- `<h1>Free Online Log File Search with AND, OR, and NOT Queries</h1>`
- Intro (~150 w): what it is, 100% in-browser (privacy), boolean phrase search, no signup.
- **How it works** — 3 steps (Upload → Query → Read matches with original line numbers).
- **Features** — 6 bullets × 1–2 lines: boolean/phrase queries; original line numbers preserved; case-insensitive grep-style matching; 50 MB files; 21 interface languages; AI-agent tools (WebMCP).
- **Sample query gallery** — 6 real queries, each with a one-line "what it finds" explanation (pull from spec/query-language vectors; include the canonical MID example).
- **FAQ** — 10 Q/As rendered visibly (~400 w; must equal the FAQPage JSON-LD answers): privacy/no-upload, max size, file types, case sensitivity, mobile, why free, what WebMCP means for users, how line numbers work, what happens to files on reset/new upload, supported browsers.
- Links out to all 4 guide pages + privacy.
- Meta: title `SimpleLogSearch — Free Log File Search with AND/OR/NOT (In-Browser)`; description ≤ 155 chars.

### 1.2 `query-syntax/index.html` — ~950 words — "Log Search Query Syntax Reference"
H1 `Log Search Query Syntax: AND, OR, NOT, and Quoted Phrases`. Sections:
The basic idea (phrase = quoted substring; term = single token); Operators
table (AND/OR/NOT with 2 examples each); Precedence & parentheses (work the
canonical MID example **step by step** — this is the page's hero content);
Implicit AND; Case-insensitive matching & the `192.168.1.1` vs `192.168.1.10`
substring caveat with the trailing-space narrowing trick; 12-row example table
(query → what it matches — reuse vectors V01–V19, reworded); Common mistakes
(5 items: missing quotes for multi-word, uppercase operators myth, empty
phrase, dangling AND, searching for the literal word and).

### 1.3 `how-to-search-logs/index.html` — ~1,000 words — practical guide
H1 `How to Search Log Files Like a Pro`. Sections: What logs actually tell
you (timestamps/IPs/levels/correlation IDs — MID is one example); The 6-step
investigation workflow using this tool (load → orient with broad terms →
narrow with AND → exclude noise with NOT → follow correlation IDs → note
line numbers); Worked case study (~250 w): reconstructing an outage timeline
from a web access log (status 500s, NOT the health-check IP, trace IDs); Log
formats you can search (syslog, IIS/Apache access, Windows Event flat-text
exports, JSON lines, any line-based text — one example line each); 10 pro tips
(quote exact strings, use NOT for noise IPs, quote the time prefix to bound a
time range, combine service + level terms, …).

### 1.4 `faq/index.html` — ~600 words, 14 Q/As
Superset of index FAQ + additions: Is my data sent anywhere? (No — all
client-side; cite the architecture) Can I search CSV/JSON/XML? (Any line-based
text file) Why no account/server? What browsers? (all evergreen; WebMCP agent
tools need Chrome 149+/Edge 150+/ChatGPT Desktop) What is WebMCP and how do I
use it as a user? (ask your AI agent in natural language) How big a file can I
open? Can I search across multiple files? (v1: one at a time — roadmap note)
Is it mobile-friendly? Who makes this? Ads disclosure (monetized via Google
AdSense; see privacy). Contact → cehstudy.com contact page.

### 1.5 `about/index.html` — ~350 words
H1 `About SimpleLogSearch`. Author: Chris Pardue (cybersecurity professional,
consistent with cehstudy.com — link both ways); why this tool exists (private,
no-server log triage); design principles (privacy-first client-side, familiar
Google-style dark UI, agent-friendly via WebMCP); tech notes (static site,
vanilla JS, GitHub Pages, virtualized rendering); related projects list.

### 1.6 `privacy-policy/index.html` — ~450 words (AdSense requirement)
Covers: no files ever leave the browser (read-only in-memory processing;
nothing stored server-side; nothing in cookies/localStorage except the chosen
UI language); no accounts, no tracking of file contents; third-party Google
AdSense ads (post-approval) set cookies per Google's policy; no analytics
scripts in v1; contact.

All six pages share: header (logo left, language select right — content pages
include it too for consistency; on content pages switching language only
affects chrome strings, body stays English), footer nav (all 6 links),
`theme-color #202124`, and the dark theme.

## 2. Per-page meta & JSON-LD

Every page: unique `<title>` + `meta description`; `<link rel=canonical>`
absolute URL; `og:title/og:description/og:url/og:type`; `robots: index, follow`;
JSON-LD blocks:

| Page | JSON-LD |
|---|---|
| index | `WebSite` (name, url, `potentialAction` SearchAction → `https://simplelogsearch.com/?q={search_term_string}`); `SoftwareApplication` (applicationCategory "DeveloperApplication", operatingSystem "Web", offers price 0 USD — **no aggregateRating/fake reviews**); `WebPage`; `FAQPage` mirroring the 10 visible index FAQs verbatim |
| query-syntax / how-to-search-logs | `Article` (headline, author Person Chris Pardue, dateModified) + `BreadcrumbList` |
| faq | `WebPage` + `FAQPage` (14 Q/As verbatim) + BreadcrumbList |
| about | `AboutPage` + `Person` (Chris Pardue, sameAs cehstudy.com/about/) + BreadcrumbList |
| privacy-policy | `WebPage` + BreadcrumbList |

The app reads `?q=` on load → prefills the search input (CHECKLIST 3.4), so
the SearchAction is functional, not decorative.

## 3. sitemap / robots / GSC

- `sitemap.xml`: all 6 URLs, absolute, with `lastmod` (bump only when page
  content actually changes — cehstudy convention).
- **Domain-root robots.txt = this repo's `robots.txt`** (2026-09-19: dedicated
  domain — the repo root serves at `https://simplelogsearch.com/`, so the
  project owns its own domain root; the old username-repo constraint no longer
  applies). It must carry `Sitemap: https://simplelogsearch.com/sitemap.xml` +
  the AI-crawler allowlist (cehstudy pattern: GPTBot, Google-Extended, CCBot,
  ClaudeBot, PerplexityBot allowed) — created in CHECKLIST 6.7, live-checked
  in 6.8.
- 404: branded dark `404.html` (logo + "page not found" + link home) — Pages
  serves it for bad paths under the site.
- GSC (CHECKLIST 7.1, `[MANUAL user]`): property `simplelogsearch.com` (domain property), submit
  the sitemap URL, then request indexing for each of the 6 URLs right after
  deploy; monitor Index Coverage for ~2 weeks before the AdSense application.

## 4. AdSense process (new site, existing account)

Lessons carried over from cehstudy (see `history/cehstudy.md`): **no ad code of
any kind before approval** (live placeholder slot was a re-rejection risk);
expect a "thin content" round on the first review of a tool site; use the
2–4 week wait after content stabilizes; keep insertion scripts OUT of the repo.

1. Deploy the complete site (M6 done, M7 gates green) — zero ad code.
2. `[USER DECISION]` CHECKLIST 7.4 — domain strategy:
   - **(a) apply as-is** on `cpardue.github.io`: Google reviews the **whole
     domain**, so the username homepage (repo `cpardue.github.io`) is in scope
     and must itself not be thin. Cheap, but riskier.
   - **(b) custom domain first (recommended)**: user buys e.g.
     `simplelogsearch.com` → add `CNAME` file to repo + DNS CNAME to
     `cpardue.github.io` → update all canonicals/og/sitemap/SearchAction URLs
     (mechanical find-replace across the 6 pages, sitemap, robots copy) →
     verify on the new domain → apply AdSense for the new domain. Also fixes
     the SearchAction/domain trust issue permanently.
3. Wait until the 6 URLs show as indexed in GSC and ~2–4 weeks have elapsed
   since final content deploy (cehstudy timing heuristic).
4. `[MANUAL user]` AdSense: "Add website" with the chosen domain → complete
   application → if rejected, fix cited issues, re-deploy, wait 2–4 weeks,
   "Request review" with a summary note (cehstudy Phase 7.2 protocol).
5. **After approval only** (separate future session, CHECKLIST 7.6): create ad
   units; insert via out-of-repo script convention (cehstudy
   `adsense-insert.js` pattern); content pages first (guide/FAQ), app page
   last; keep the site free of any placeholder slots until units are real.
6. Disclosure: FAQ + privacy already disclose AdSense — keep them accurate as
   the ads go live.


