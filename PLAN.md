# SimpleLogSearch — End-to-End Implementation Plan

**Goal.** A free log-file search web app that looks like Google Search in dark
mode: users upload a log file, search it with quoted-phrase boolean queries
(`"MID 123456" and "MID 123654" not "192.168.1.1"`), and see matching lines
with original line numbers in an IDE-style window. The site must be Google
search-indexable, WebMCP-capable (AI agents can drive it), and deep enough to
pass AdSense thin-content review. 100% client-side: log files never leave the
user's browser (privacy is a feature, not just a constraint).

**Live URL.** `https://cpardue.github.io/simplelogsearch/` (repo
`cpardue/simplelogsearch`, Pages "deploy from branch", no build step).

---

## 1. Binding constraints → design decisions

| Constraint | Design decision |
|---|---|
| GitHub Pages = static only, no server code | All parsing/matching in the browser (vanilla JS). No API, no DB. |
| Project site lives at subpath `/simplelogsearch/` | All asset URLs **relative** (`css/...`, `js/...`) — never root-absolute. Canonical/OG/sitemap URLs **absolute** with full prefix. No SPA routing needed (multi-page static site). |
| Domain-root `robots.txt` belongs to the `cpardue.github.io` repo | We cannot own it → rely on GSC sitemap submission; optionally add one Sitemap line to the username-site robots.txt (CHECKLIST 6.8). Keep our own copy in-repo for the future custom-domain step. |
| Pages gives no custom HTTP headers | No COOP/COEP needed: WebMCP's "origin isolation" requirement is simply "don't use `document.domain`" — satisfied. SharedArrayBuffer unavailable → not needed (single-threaded scan is fast enough at our 50 MB cap). |
| AdSense: placeholder ad code before approval = rejection risk (cehstudy lesson, 2026-09-10) | **Zero ad code in v1.** Content depth + privacy policy + wait period instead. Ad insertion is a separate post-approval session (CHECKLIST 7.6). |
| AdSense reviews the whole domain | Subpath `cpardue.github.io` means the username homepage is in review scope → explicit user decision at CHECKLIST 7.4: apply as-is vs buy custom domain first (recommended). |
| No git CLI in this dev environment | All GitHub ops via GitHub MCP tools + Contents-API scripts (PAT from cline MCP settings). Local folder = working copy; rollback via recorded commit shas. |
| Memory budget for big logs | 50 MB file cap → strings + lowercased copies ≈ 130–200 MB peak on desktop; acceptable. Graceful error string above cap. Document desktop recommendation. |
| `cehstudy` is mid-AdSense-resubmission (target ~2026-10-14) | Run SimpleLogSearch as an independent track; never mix ad code or content between the two sites. |

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Markup/CSS/JS | Hand-written HTML + one shared `css/styles.css` + vanilla ES2020 JS | cehstudy pattern; zero dependencies, zero build. |
| Fonts | System UI stack; `ui-monospace` stack for the log view | No webfont downloads → fast LCP, no license issues. |
| Icons | Inline SVG (magnifier, upload, reset) | No icon fonts. |
| Favicon/OG image | `favicon.svg` (magnifier over log lines) in M6 | Raster OG image optional post-launch. |
| Automated tests | `node test/query-tests.mjs` (parser vectors) + optional tiny GH Actions workflow running it on push | Parser is pure functions with a UMD export guard → same file runs in browser and node. |
| E2E | Manual matrix (CHECKLIST per-phase Verify gates), repeated on the live site in M7 | Playwright deferred (optional future). |
| i18n | `js/i18n.js` string dictionaries; pre-paint inline head script reads `localStorage.sls-lang` to avoid FOUC | No framework. |

## 3. Repo layout (= this local folder)

```
simplelogsearch/
├─ .nojekyll                    # empty; stops Jekyll processing (underscore-file gotcha, cehstudy lesson)
├─ index.html                   # the app (tool UI) + below-fold SEO content + JSON-LD
├─ 404.html                     # branded dark 404 with link home
├─ css/styles.css               # dark theme tokens + all components + RTL via logical properties
├─ js/
│  ├─ app.js                    # wiring: upload flow, buttons, error slot, status bar, ?q= param
│  ├─ query-parser.js           # pure tokenizer/parser/evaluator (UMD export; node-testable)
│  ├─ log-view.js               # virtualized line view: gutter, fixed 16px rows, resize, match filter
│  ├─ i18n.js                   # 21-locale catalogs + apply/persist/dir
│  └─ webmcp.js                 # navigator.modelContext tool registration (feature-detected)
├─ samples/                     # 4 deterministic sample logs <50 KB each (also used by WebMCP + demos)
├─ query-syntax/index.html      # content page: full query language reference (~950 w)
├─ how-to-search-logs/index.html# content page: practical log-analysis guide (~1000 w)
├─ faq/index.html               # 14 visible Q/As + FAQPage JSON-LD (~600 w)
├─ about/index.html             # author/mission (~350 w)
├─ privacy-policy/index.html    # required for AdSense (~450 w)
├─ test/query-tests.mjs         # node runner: all parser vectors from spec/query-language.md
├─ favicon.svg
├─ sitemap.xml                  # 6 URLs
├─ SESSION_PROMPT.md            # paste-this-to-start-a-build-session prompt (mirrored)
├─ CHECKLIST.md                 # this project's multi-session execution checklist (mirrored from local)
├─ PLAN.md                      # this doc (mirrored)
└─ spec/                        # the 5 spec docs (mirrored)
```

## 4. UI spec (summary — full detail in `spec/ui-spec.md`)

Google Search dark-mode look, fixed palette: page `#202124`, search bar
`#303134` r24 h46 with `#9aa0a6` icons, buttons `#303134` h36 r4, error text
`#f28b82`. Layout:

- **Header row:** left = wordmark logo "SimpleLogSearch" (Google-style
  alternating letter colors, **always English** — never an i18n key). Right =
  language `<select>` (21 endonyms).
- **Error slot** directly above the search bar (`role=alert`, `aria-live`),
  14px red. Upload-error text is literally: `✕ Upload Log File before searching`.
- **Search bar:** Google-style rounded input; submit on Enter or magnifier
  button.
- **Buttons row:** "Reset" and "Upload" (i18n), Google button styling.
  Upload also owns the hidden `<input type=file>`; its "momentary light-up" =
  CSS keyframe glow, ~3 pulses / 1.5 s, triggered together with the error msg.
- **Result window** (appears after first successful upload only): full browser
  width; header status row (filename • total lines • match count for query);
  body = IDE-style virtualized list — sticky left gutter with **original line
  numbers** (never renumbered), `white-space: pre` content, fixed 16px rows;
  initial height exactly 20 rows; user-resizable by dragging the bottom-right
  corner (CSS `resize: vertical` + visible grip), min 5 rows / max 90vh.

**Behavior matrix (authoritative — every state tested in CHECKLIST):**
no file + search → Upload flash + error msg, input kept; no file + Reset →
no-op; upload → window appears with full log; new upload → wipes previous
file, shows new file fresh, clears query; search (file) → matches only with
original line numbers retained, re-searches update the same window; Reset
(file) → clears input + restores entire log; empty query (file) → shows all
lines, no error; invalid query → red syntax-hint error, previous view
untouched; file > 50 MB → error, nothing loaded.

## 5. Query language (summary — full grammar + vectors in `spec/query-language.md`)

Double-quoted phrases, bare terms (implicit AND between adjacent terms),
operators `AND OR NOT` (any casing, token-matched), parentheses for grouping,
precedence `NOT > AND > OR`. Matching = **case-insensitive substring** per
line (grep-like; documented that `"192.168.1.1"` also matches inside
`"192.168.1.10"` — quote more context to narrow). `NOT X` excludes any line
containing X regardless of other terms. Canonical vector (from the product
requirement): `"MID 123456" and "MID 123654" not "192.168.1.1"` → lines with
both MID phrases and nowhere containing the IP. Malformed queries (unbalanced
quotes/parens, dangling operator, empty phrase) → structured error surfaced in
the error slot; search never runs on a bad parse.

## 6. i18n (summary — catalog in `spec/i18n.md`)

Locales: `en` + 20: zh-CN, es-ES, hi-IN, ar, bn, pt-BR, ru, ja, de, fr, ko, tr,
vi, id, th, pl, ur, nl, it, uk. Scope = **core UI strings only** (~24 keys:
buttons, placeholder, all error/status strings, nav labels, language label).
Content pages stay English. Dropdown shows endonyms (中文(简体), Español, …).
Persistence `localStorage.sls-lang`; pre-paint inline head script applies
before render; `ar`/`ur` set `dir=rtl` (CSS uses logical properties throughout
so the UI mirrors correctly); logo/product name/operators never translated.

## 7. WebMCP (summary — schemas + code in `spec/webmcp.md`)

W3C WebML spec: expose JS functions as agent tools via
`navigator.modelContext.registerTool(name, {description, inputSchema,
execute})` — feature-detected, wrapped, isolated in `js/webmcp.js` (loaded on
index only). Four tools operating on the page's in-memory log:

1. `get_log_status` → has_log / file_name / total_lines / has_searched / match_count
2. `search_logs({query})` → runs the same parser/matcher; returns counts + first 10 match previews (line number + ≤200 chars) or structured error
3. `reset_view` → restores full log, clears query
4. `load_sample_log({sample: windows|linux|web|app})` → loads a bundled sample from `samples/` (enables fully agent-driven demos **and** E2E tests without real files)

Support today: Chrome 149 + Edge 150 behind **origin trials** (free token per
origin — user action, CHECKLIST 5.5; local dev via
`about:flags#enable-webmcp-testing`), ChatGPT Desktop natively, Brave Leo
experimental, Firefox/Safari no-op silently. Test with the "Model Context Tool
Inspector" extension. Spec still evolving → single-file isolation means a
rename/fix never touches app code.

## 8. SEO / Google indexability (summary — page-by-page in `spec/seo-adsense.md`)

Six indexable URLs (app + 4 content pages + privacy), each with unique
H1/title/description, absolute canonicals, `og:*`, `theme-color #202124`,
internal links both directions via shared header/footer nav. JSON-LD:
`WebSite`(+`SearchAction` targeting `?q={search_term_string}` — the app reads
`?q=` and prefills the box), `SoftwareApplication` (price 0, no fake ratings),
`WebPage` + `BreadcrumbList` on subpages, `FAQPage` mirroring **visible** FAQ
text exactly, `Person`/`AboutPage` on about. `sitemap.xml` with all 6; GSC
property + submission = manual user step (CHECKLIST 7.1); optional one-line
Sitemap add to the username-site `robots.txt` (CHECKLIST 6.8). `404.html`
branded. No per-locale hreflang alternates (single URL per page; language is a
UI toggle, like cehstudy's `en-us` + `x-default` only).

## 9. AdSense thin-content strategy (summary — full in `spec/seo-adsense.md`)

Rejection root cause for tool sites = little original indexable text + missing
policy pages. Countermeasures: ~4,300 words of genuinely original content
across 6 URLs (per-page outlines + word targets in the spec), visible (not just
JSON-LD) FAQ, real author identity consistent with cehstudy.com ("Chris
Pardue"), privacy policy explaining client-side processing. Process: deploy
clean (no ad code — cehstudy lesson) → let it index ~2–4 weeks (GSC) → user
applies/requests review → iterate if rejected → **only then** add ad units via
the out-of-repo insertion-script convention (cehstudy `adsense-insert.js`
pattern), content pages first, app page last.

## 10. Deployment & ops

1. Create public repo via GitHub MCP (`github__create_repo`).
2. Push files: GitHub MCP create/update for normal files; Contents-API node
   script (PAT from cline MCP settings) when batching many files — proven
   cehstudy pattern.
3. Pages: `PUT /repos/cpardue/simplelogsearch/pages` with source
   `{branch:"main", path:"/"}` via token script; fallback `[MANUAL user]`
   Settings → Pages → "Deploy from a branch".
4. Verify live 200 (Pages deploys take 1–5 min) at the end of every phase.
5. Record each phase's final commit sha in CHECKLIST Session Log = rollback point.

## 11. Test & verification gates

- **Automated:** `node test/query-tests.mjs` — all vectors in
  `spec/query-language.md` must pass; optional GH Actions workflow runs it on
  push (no build needed).
- **Manual per phase:** behavior matrix (M2), query edge cases (M3), i18n sweep
  across all 21 locales (M4), WebMCP inspector script (M5).
- **Pre-launch (M7):** internal link checker script (0 broken targets —
  cehstudy convention), schema validation on every JSON-LD block, Lighthouse
  mobile+desktop (Perf ≥ 90, A11y ≥ 95, SEO 100, Best Practices ≥ 90), full
  matrix re-run on the live site with clean cache, word-count audit vs targets.

## 12. Milestones

| # | Milestone | Exit gate |
|---|---|---|
| M0 | Repo scaffold + Pages live (placeholder page, `.nojekyll`, planning docs mirrored) | `https://cpardue.github.io/simplelogsearch/` → 200 |
| M1 | App shell: header/logo/lang select/search bar/buttons/error slot, dark theme, i18n skeleton (EN) | Manual pass of ui-spec §shell; error-flash + no-op Reset correct |
| M2 | Upload + virtualized result window (line numbers, resize, replace) + full behavior matrix | Manual matrix all-green incl. 5 MB scroll perf |
| M3 | Query engine + node tests + wiring + `?q=` param | All parser vectors pass; canonical example correct on sample |
| M4 | i18n: 20 locales, dir/RTL, persistence | 21-locale sweep clean, logo stays English |
| M5 | WebMCP tools + 4 sample logs + inspector protocol (+ user origin-trial step) | 4 tools listed; scripted agent flow returns expected counts |
| M6 | Content pages + SEO (JSON-LD, sitemap, 404, robots line) + word-count audit | All 6 URLs schema-clean, 0 broken links, word targets met |
| M7 | Launch gates: GSC submission, Lighthouse, live re-test, **user AdSense domain decision**, wait, apply | Site indexed; AdSense application submitted (manual) |

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| WebMCP API still evolving (W3C draft; Chrome origin-trial stage) | Feature-detect + isolate in one file; whole M5 removable without touching app code. |
| AdSense reviews the whole `cpardue.github.io` domain (username homepage in scope, possibly thin) | CHECKLIST 7.4 decision; recommended path = custom domain before applying. |
| 50 MB logs on low-memory phones | Hard cap + error string; "desktop recommended" documented; virtualized view keeps DOM light. |
| Machine-translated UI strings in 20 locales | Core-strings-only scope; back-translation spot checks (M4.1); one-file fix path later. |
| `SearchAction` implies a queryable site, but queries need a user file | SearchAction targets the app with `?q=` prefill only; guide pages carry the real indexable depth. Acceptable, documented. |
| Pages deploy latency during verify loops | Verify steps budget 5 min; scripts retry instead of manual polling. |


