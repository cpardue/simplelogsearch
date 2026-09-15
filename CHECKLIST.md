# SimpleLogSearch — Implementation Checklist

**This is the execution document.** Work through it across multiple sessions,
one item at a time.

## Protocol (read every session before starting)

1. Read `PLAN.md` + the `spec/*` docs relevant to the current item. This file
   is the only thing you check off.
2. Find the **first unchecked `- [ ]` item in document order**. Execute it
   completely (including its sub-steps). Do not start a later item before the
   earlier one is checked and verified.
3. Every item ends with a **Verify** gate. Run it for real (command output,
   browser check, or live-URL probe). Never mark an item done without its
   Verify passing; if it fails, fix within the same item before moving on.
4. After each completed item: check the box, append a one-line entry to the
   Session Log at the bottom (time + item + commit sha if pushed).
5. `[MANUAL user]` items: prepare everything, then STOP and tell the user
   exactly what to do; mark done only after the user confirms it happened.
6. `[USER DECISION]` items: present options + recommendation, stop for the
   user's choice, record the choice in the Session Log.
7. Pushing: local folder `simplelogsearch/` is the working copy and maps 1:1
   to repo root. Push via GitHub MCP tools (create/update file) or a
   Contents-API node script using the PAT from cline MCP settings
   (fine-grained `github_pat_` accepted — cehstudy precedent). Record each
   phase's final commit sha in the Session Log (that is the rollback point).
8. Spec-first rule: if code and a spec doc disagree, fix the spec first (with
   a one-line rationale), then the code, same session.
9. Environment facts: Windows PowerShell, no git CLI, node available. GitHub
   Pages deploys take 1–5 min after push — verify steps should retry the live
   URL probe a few times before failing.

Legend: `B#` = behavior-matrix row from spec/ui-spec §5; `V#` = query test
vector from spec/query-language §6.

---

## Phase 0 — Scaffold & first deploy (gate: live URL serves the site)

- [x] 0.1 Create public repo `cpardue/simplelogsearch` via GitHub MCP
  (`github__create_repo`, description: "SimpleLogSearch — free in-browser log
  file search with AND/OR/NOT queries. Static, private-by-design, WebMCP-ready.",
  private: false).
  **Verify:** `github__get_repo` returns it; clone_url visible.
- [x] 0.2 Scaffold the local tree per PLAN §3: empty `.nojekyll`;
  placeholder `index.html` (dark page, wordmark logo, "SimpleLogSearch —
  launching soon"); stub `css/styles.css` with the design tokens from
  spec/ui-spec §1; empty stubs `js/app.js`, `js/query-parser.js`,
  `js/log-view.js`, `js/i18n.js`, `js/webmcp.js`; `README.md`.
  **Verify:** folder tree matches PLAN §3 (list it).
- [x] 0.3 Mirror planning docs into the repo layout: copy `README.md`,
  `CHECKLIST.md`, `PLAN.md`, `SESSION_PROMPT.md`, and `spec/` as-is to repo
  root so future sessions can read them from GitHub (`raw.githubusercontent.com/cpardue/simplelogsearch/main/...`).
  **Verify:** files exist locally at those exact paths; sizes match source.
- [x] 0.4 Push all Phase 0 files (MCP or Contents-API script).
- [x] 0.5 Enable GitHub Pages: `PUT /repos/cpardue/simplelogsearch/pages` with
  body `{"source":{"branch":"main","path":"/"}}` via token script
  (Invoke-RestMethod is fine). On 4xx/403 → `[MANUAL user]`: Settings → Pages
  → "Deploy from a branch" → main / (root) → Save.
  **Verify:** GET the same endpoint returns `html_url == https://cpardue.github.io/simplelogsearch/`.
   *(2026-09-14 amended, protocol 8: user pre-enabled Pages in Settings and set custom domain
   `chris-pardue.com` ahead of Phase 7.4 — do NOT strip the cname to force the old string;
   functional gate = source {branch: main, path: /} + status built + live probe.)*
- [x] 0.6 Live probe: fetch
  `https://cpardue.github.io/simplelogsearch/` until HTTP 200 (retry up to
  5×, 30 s apart). **Verify:** body contains "SimpleLogSearch". Record deploy
  commit sha in Session Log.

## Phase 1 — App shell (gate: ui-spec §2–§3 manual pass)

- [x] 1.1 `css/styles.css`: implement all components from spec/ui-spec
  §1–§3 + §6 + §7 using the exact tokens/sizes: header, logo wordmark (4-color
  letter spans), language select, search bar (inline SVG magnifier icons),
  Reset/Upload buttons, error slot, `uploadFlash` keyframes, footer nav,
  responsive breakpoint 720px. Logical properties only.
- [x] 1.2 `index.html`: full semantic structure per spec/ui-spec §2 diagram —
  skip-link; header (logo + `#langSelect` with all 21 endonym options per
  spec/i18n §1); `#errorSlot` (`role=alert`); search `<form>` (input `name=q`
  + submit icon button); buttons row (`#resetBtn`, `#uploadBtn`, hidden
  `#fileInput`); `#results` section (`hidden`) with status row + viewport div;
  footer (6 nav links to Phase-6 pages — 404s until then are OK); pre-paint
  i18n inline head script (spec/i18n §4); deferred `js/i18n.js`, `js/app.js`.
  Relative asset URLs only.
- [x] 1.3 `js/i18n.js`: full EN catalog (all 23 keys, exact values from
  spec/i18n §2) + stub dictionaries for the other 20 locales (EN fallback ok
  for now); `apply(locale)` covering text/aria/placeholder, `<html lang|dir>`,
  persistence; boot-time application.
- [x] 1.4 `js/app.js` shell behaviors: language change → apply + persist;
  Reset with no file loaded = strict no-op (B2); Upload click → open picker,
  cancel = nothing (B4; store the selected File in state — handling lands in
  Phase 2); search submit with no file → flash Upload + `err.noFile` (B1);
  Esc clears error slot only (B12); `/` focuses search.
- [ ] 1.5 Push; live probe.
- [ ] 1.6 Manual Verify pass (browser, 1280px + 390px): every ui-spec §2/§3
  visual present (colors, radii, sizes); B1 shows exact text `✕ Upload Log
  File before searching` + ~1.5 s flash; B2 and B4 change nothing; Esc works;
  language switch updates all chrome strings and persists across reload; no
  console errors.

## Phase 2 — Upload + result window (gate: matrix rows B3–B10, B13)

- [ ] 2.1 `js/log-view.js` per spec/ui-spec §4: `setLines(lines)`,
  `showMatches(indexes0based)` (gutter shows original numbers),
  `scrollToTop()`; virtualization (visible slice + 10 overscan, spacer
  height); sticky gutter with auto digit width; 16px fixed rows;
  `resize:vertical` + corner grip; initial height 20 rows; min 5 / max 90vh.
  Pure DOM, no deps.
- [ ] 2.2 Upload flow in app.js (B3/B5/B13): validate ≤ 50 MB → else
  `err.fileTooLarge`; status `loading`; async `file.text()`; split on
  `\r?\n` (drop one trailing empty element if file ends with a newline); keep
  `lines[]`, build `linesLower[]` once; `logView.setLines(lines)`; unhide
  `#results` (stays visible thereafter); status `loaded`; clear error slot.
- [ ] 2.3 Replace semantics (B9): new upload discards old arrays by
  reassignment, clears the search input, shows the new file from line 1.
- [ ] 2.4 Reset with file (B8): clear input + error, show all lines, status
  `loaded`. (No-file path stays strict no-op from 1.4.)
- [ ] 2.5 Empty/whitespace query with file (B10); resize drag: content intact
  across resize, min/max clamps hold.
- [ ] 2.6 Push; live probe.
- [ ] 2.7 Manual Verify matrix: B3 (3-line file → window appears, numbers
  1–3, full width, ~20-row height); scroll a generated ~5 MB / 100 k-line log
  top→bottom without jank; gutter pinned; original numbers correct at spot
  checks; B4/B5; B9 (file A → file B: phrase unique to A now yields 0 matches;
  status shows B); B8; B10; B13 (`loading` state visible on a 10 MB file).

## Phase 3 — Query engine (gate: all node vectors green + manual B6/B7/B11)

- [ ] 3.1 `js/query-parser.js` per spec/query-language §1–§3: tokenizer,
  recursive-descent parser (NOT > AND > OR, parens, implicit AND, any-case
  operator tokens), AST → compiled evaluator over `linesLower`; error objects
  with the exact `detail` strings from §3; UMD export guard
  (`if (typeof module !== "undefined") module.exports = ...`) so node can
  import it unchanged. No DOM references in this file.
- [ ] 3.2 `test/query-tests.mjs`: embed the 24-line fixture verbatim from
  spec §5; encode all vectors V01–V25 (spec is source of truth); runner prints
  PASS/FAIL per vector, exits non-zero on failure.
- [ ] 3.3 **Verify:** `node test/query-tests.mjs` → all PASS. Paste the last
  3 output lines into the Session Log. (Any spec/code mismatch → spec-first
  rule, Protocol 8.)
- [ ] 3.4 Wire into app.js: on submit with file loaded — parse; error →
  `err.invalidQuery` with `{detail}`, previous view untouched (B11); success →
  single pass over `linesLower`, collect indexes, `logView.showMatches(...)`,
  status `matched`/`noMatches` (B6/B7); empty/whitespace query → show all, no
  error (B10). Read `?q=` URL param on load → prefill input (SearchAction
  support; do NOT auto-run — no file is present).
- [ ] 3.5 Perf check: generate a ~20 MB log locally (node script, temp file —
  do not commit it), load it, run the canonical query + a 4-phrase OR query,
  time with `console.time`. **Verify:** each search < 2 s; record numbers.
- [ ] 3.6 Push; live probe.
- [ ] 3.7 Manual Verify: V04 canonical on the Phase-5 sample later — for now
  use the node fixture text saved as a scratch file: expected single match,
  correct original line number in the gutter; re-search updates same window
  (B7); invalid queries (`"unclosed`, `AND x`) → B11; empty query → all lines.

## Phase 4 — i18n completion (gate: 21-locale sweep)

- [ ] 4.1 Translate the full 23-key catalog into all 20 non-EN locales per
  spec/i18n §3 rules (one pass per locale; preserve `{slot}` tokens; `err.*`
  start with `✕`; never translate product name/AND-OR-NOT). Back-translation
  spot check: 5 random keys × ar, zh-CN, ja re-translated to EN and compared.
- [ ] 4.2 Dir/RTL: apply() sets `<html dir>` per spec/i18n §1 table (ar/ur
  rtl); confirm boot script does the same pre-paint.
- [ ] 4.3 Push; live probe.
- [ ] 4.4 Manual Verify sweep: cycle through **all 21 locales**: every chrome
  string localized with correct slots/numbers; logo stays exactly
  "SimpleLogSearch" in English; content/footer note behave per spec (footer
  note translated, page body on index FAQ section stays English); ar + ur
  visually mirror (header order, error slot side, gutter side) with no
  overflow; reload keeps the last locale; set an invalid stored value → falls
  back to `en`.

## Phase 5 — WebMCP + sample logs (gate: spec/webmcp §5 protocol)

- [ ] 5.1 Sample logs per spec/webmcp §4: write `test/gen-samples.mjs`
  (seeded/deterministic, no deps) generating the 4 files in `samples/` with
  the required content markers; run it; commit both generator and outputs.
  Record the designed canonical-query match count for windows-event.log in
  the Session Log (used by 5.4).
- [ ] 5.2 `js/webmcp.js` per spec/webmcp §2–§3: feature detection, guard
  wrapper, the 4 tools (`get_log_status`, `search_logs`, `reset_view`,
  `load_sample_log`) with exact schemas/returns; expose a tiny internal API on
  `window.SLS` (search/reset/status/loadSample) that both app.js and webmcp.js
  use — no tool may duplicate UI logic.
- [ ] 5.3 Include `js/webmcp.js` in index.html only (after app.js).
- [ ] 5.4 Local protocol (spec/webmcp §5 steps 1–4, 6): Chrome with
  `about:flags#enable-webmcp-testing` + Model Context Tool Inspector; serve
  the folder over localhost http(s). **Verify:** exactly 4 tools listed with
  correct schemas; scripted flow returns expected values (windows sample count
  matches the number recorded in 5.1); Firefox load → zero console noise.
- [ ] 5.5 `[MANUAL user]` Origin trials: apply for WebMCP origin trial tokens
  (Chrome: developer.chrome.com origin trials; Edge: Microsoft Edge origin
  trials) with origins `https://cpardue.github.io`, `http://localhost`,
  `https://localhost`; hand over the two tokens → LLM inserts
  `<meta http-equiv="Origin-Trial">` metas in index.html head and pushes.
- [ ] 5.6 Live Verify (spec/webmcp §5 steps 3–5 against
  `https://cpardue.github.io/simplelogsearch/`): 4 tools listed; scripted flow
  passes on the live origin; natural-language agent test (Chrome Gemini or
  ChatGPT Desktop) returns the correct canonical-query count by invoking tools.

## Phase 6 — Content pages + SEO (gate: schema-clean, links clean, word floors met)

- [ ] 6.1 `query-syntax/index.html` per spec/seo-adsense §1.2 (≥ 950 words of
  body text; shared header/footer/dark theme; meta/canonical/og/JSON-LD per §2).
- [ ] 6.2 `how-to-search-logs/index.html` per §1.3 (≥ 1,000 words).
- [ ] 6.3 `faq/index.html` per §1.4 (14 visible Q/As ≥ 600 words; FAQPage
  JSON-LD text verbatim-matches the visible answers).
- [ ] 6.4 `about/index.html` per §1.5 (≥ 350 words; Person JSON-LD; two-way
  links to cehstudy.com).
- [ ] 6.5 `privacy-policy/index.html` per §1.6 (≥ 450 words).
- [ ] 6.6 index.html below-fold content per §1.1 (H1, intro, how-it-works,
  features, 6-query gallery, 10 visible FAQs; WebSite+SoftwareApplication+
  FAQPage JSON-LD; `?q=` prefill already live from 3.4); `favicon.svg`.
- [ ] 6.7 `sitemap.xml` (6 absolute URLs + lastmod) and branded `404.html`;
  local `robots.txt` copy in repo (Sitemap line + AI-crawler allowlist per
  spec §3).
- [ ] 6.8 Update domain-root robots: via GitHub API, read
  `cpardue.github.io/robots.txt` (create if missing), ensure
  `Sitemap: https://cpardue.github.io/simplelogsearch/sitemap.xml` present,
  preserve existing content/AI allowlist. Push.
- [ ] 6.9 Push everything; live probe all 6 URLs + 404 page.
- [ ] 6.10 Write `test/links-check.mjs` (node): crawl the 6 local HTML files'
  internal hrefs (strip query/fragment) → each must resolve to a local file;
  also validate every JSON-LD block parses as JSON and required fields exist
  per §2. **Verify:** run it → 0 broken links, all JSON-LD valid. Paste output.
- [ ] 6.11 Word-count audit: strip tags/scripts from each of the 6 pages,
  count words (node one-liner in the links-check script or separate); **Verify:**
  each page ≥ its §1 floor; record table in Session Log.

## Phase 7 — Launch gates, GSC, AdSense prep (gate: site indexed + application submitted)

- [ ] 7.1 `[MANUAL user]` Google Search Console: property `cpardue.github.io`
  (create if missing), submit sitemap
  `https://cpardue.github.io/simplelogsearch/sitemap.xml`, then request
  indexing for each of the 6 URLs. **Verify:** user confirms submission; LLM
  records the date in Session Log (indexing clock starts now).
- [ ] 7.2 Lighthouse (mobile + desktop) on index + query-syntax pages:
  Perf ≥ 90, A11y ≥ 95, SEO = 100, Best Practices ≥ 90. Fix any regression and
  re-run. **Verify:** record both scorecards in Session Log.
- [ ] 7.3 Full manual re-run on the **live** site with a clean cache: every B#
  matrix row, 3 sample locales incl. one RTL, `?q=` prefill from a crafted URL,
  404 page. **Verify:** all pass; note anomalies in Session Log.
- [ ] 7.4 `[USER DECISION]` AdSense domain strategy (spec/seo-adsense §4.2):
  (a) apply on `cpardue.github.io` subpath as-is — whole domain incl. username
  homepage gets reviewed; or (b) RECOMMENDED: buy a custom domain
  (e.g. simplelogsearch.com) first — user provides the domain, LLM then: add
  `CNAME` file, update all canonicals/og/sitemap/SearchAction/robots + local
  copy (mechanical find-replace), verify HTTPS on the new domain, update GSC
  property + resubmit sitemap. Record choice + rationale in Session Log.
- [ ] 7.5 Wait for index coverage: `[MANUAL user]` check GSC Index Coverage —
  proceed only when all 6 URLs are indexed AND ≥ ~2 weeks since final content
  deploy. **Verify:** user confirms (screenshot/counts recorded in Session Log).
- [ ] 7.6 `[MANUAL user]` AdSense application: "Add website" with the chosen
  domain (step 7.4), complete the form. Then STOP — this is a multi-week clock.
- [ ] 7.7 Rejection round (only if needed): user pastes Google's cited issues
  → LLM fixes (content depth/policy pages first), re-deploys, waits 2–4 weeks,
  user "Request review" with summary note. Loop until approval.
- [ ] 7.8 Post-approval (future session — do NOT start here): create ad units,
  insert via out-of-repo script convention (cehstudy `adsense-insert.js`
  pattern), content pages first; re-verify zero placeholder slots and that
  FAQ/privacy disclosures remain accurate.

---

## Session Log (newest first — one line per completed item)

<!-- format: [YYYY-MM-DD HH:MM] item X.Y done — verify result — commit sha -->

[2026-09-14 19:22] item 1.4 done — node behavior gate (verify-app-1.4.mjs, workspace root) 33/33 PASS: real i18n.js+app.js run in node vm over a DOM stub — lang change → I18N.apply + sls-lang persist (ar→rtl), boot syncs #langSelect, reload(ar) → pre-paint rtl + select=ar; B1 submit no-file: preventDefault + .uploading-flash + slot visible with exact '✕ Upload Log File before searching' (=I18N.EN err.noFile) + input kept + #results hidden; §3 flash class removed on animationend; §2 6 s auto-dismiss; B2 Reset no-file strict no-op (input/slot/results/storage/dir untouched); Upload click → fileInput.click; B4 cancelled picker = nothing, selected File stored in state (post-select submit skips B1) + input value reset for re-select (B9); B12 Esc clears slot only, input kept; §6 '/' focuses search from non-editable focus (preventDefault) and is ignored inside <select>; no spec/code divergence (protocol 8 not triggered) — no commit (local only; push happens at 1.5)
[2026-09-14 18:17] item 1.3 done — node verify gate (verify-i18n-1.3.mjs, workspace root) 59/59 PASS: EN catalog all 23 keys exact per i18n §2 (Unicode ✕/…/—/•/“” verified, no extra keys); LOCALES = spec §1 dropdown order (21 codes); CATALOGS has all 21, 20 non-EN stubs resolve to EN via lookup() for all 23 keys; apply(): all 15 [data-i18n*] elements in index.html set (12 text + 2 aria-label + 1 placeholder), <html lang|dir> correct (ar/ur rtl, other 19 ltr), sls-lang persisted; boot-time application: no storage → en default persisted, stored "ar" → lang=ar dir=rtl with strings applied, stale "xx-BOGUS" → en + storage rewritten; t() interpolation per §2 (toLocaleString numbers, {query} 60-char truncation+… with exactly-60 not truncated, {file}/{detail} as-is); <select> endonyms untouched (no data-i18n inside) — no commit (local only; push happens at 1.5)
[2026-09-14 17:03] item 1.2 done — node verify gate (verify-index-1.2.mjs, workspace root) 36/36 PASS: §2 diagram order skip-link→header(wordmark 15 spans + #langSelect 21 endonyms exact per i18n §1)→#errorSlot(role=alert/aria-live/hidden+empty)→main(<form class=search-bar> input[name=q] + submit icon button; .btn-row Reset→Upload + hidden #fileInput)→#results[hidden](#statusRow aria-live + #logViewport a11y.logView)→footer(nav 6 Phase-6 relative links + footer-note exact); pre-paint boot script (21-code validation, ar/ur→rtl) before CSS; exactly 2 deferred scripts i18n.js+app.js; all href/src relative; no dup ids — spec fixed first per protocol 8 (i18n §2 +nav.home="Home" → table=23 keys=stated count); title set to seo-adsense §1.1 exact value — no commit (local only; push happens at 1.5)
[2026-09-14 16:27] item 1.1 done — node verify gate (verify-styles-1.1.mjs, workspace root) 59/59 PASS: §1 all 9 tokens exact; §2 header/wordmark(4-color spans)/language select/search bar(focus-within + hover shadow)/Reset-Upload buttons/error slot(truncating); §3 uploadFlash verbatim + .uploading-flash 3×.5s; §6 skip-link + focus-visible rings on btn/select/submit; §7 <720px media query (buttons centered under bar, results full width); logical-properties-only scan clean (zero physical props); brace balance 44/44 — no commit (local only; push happens at 1.5)
[2026-09-14 15:25] item 0.6 done — live probe attempt 1 (no retries needed): GET https://cpardue.github.io/simplelogsearch/ → HTTP 200 (301 → final URL https://chris-pardue.com/simplelogsearch/ via custom domain, Cloudflare front), body contains "SimpleLogSearch"; served page is the repo placeholder — raw main index.html (751 B) byte-identical to local, live extra ~940 B is Cloudflare challenge-script injection only — deploy commit 57fcdafe44ee79ee21caf78927205e6133e3fc6d (phase-0 files; what Pages serves)
[2026-09-14 13:04] item 0.5 done — Pages enabled by user in Settings (main/ root); authenticated GET /pages via token script: source {branch: main, path: /}, status built, html_url reports user's custom domain http://chris-pardue.com/simplelogsearch/ (written verify amended per protocol 8 — cname kept; Phase 7.4 domain decision still open); live probe https://cpardue.github.io/simplelogsearch/ → 301 → chris-pardue.com → HTTP 200, body contains "SimpleLogSearch" (attempt 1); chris-pardue.com resolves via Cloudflare (DNS/origin user-side) — no app files changed; checkoff commit sha in history file
[2026-09-14 12:35] item 0.4 done — pushed via Contents-API node script (no git CLI): bootstrap .nojekyll @ 2e90818c, 16-file batch commit @ 57fcdafe on main; remote recursive tree = exactly the 17 expected blobs, sizes match local (CHECKLIST 17542 / PLAN 15473 / README 2938 / SESSION_PROMPT 3166 / spec/ 5 files), MCP root listing + raw index.html probe (751 B, placeholder intact, relative css URL) PASS — commit 57fcdafe44ee79ee21caf78927205e6133e3fc6d (phase-0 files; checkoff commit sha in history file)
[2026-09-14 12:14] item 0.3 done — local Verify PASS: all 5 doc groups at repo root (local folder = repo root 1:1), sizes complete/non-truncated: README.md 2938 B, CHECKLIST.md 17156 B, PLAN.md 15473 B, SESSION_PROMPT.md 3166 B, spec/ exactly 5 files (i18n 4463 / query-language 7260 / seo-adsense 9086 / ui-spec 6601 / webmcp 5999 B) — no commit (local only; push happens at 0.4)
[2026-09-14 11:57] item 0.2 done — tree listed per PLAN §3: .nojekyll (0 B), index.html placeholder (wordmark + "launching soon"), css/styles.css with all ui-spec §1 tokens, js/ app|query-parser|log-view|i18n|webmcp stubs, README.md present — no commit (local only; push happens at 0.4)
[2026-09-14 11:46] item 0.1 done — github__get_repo returns repo (public, id 1370246873), clone_url https://github.com/cpardue/simplelogsearch.git visible — no commit (empty repo, nothing pushed)




