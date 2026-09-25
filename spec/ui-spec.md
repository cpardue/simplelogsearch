# Spec — UI (Google Search dark mode)

All CSS in `css/styles.css`, **logical properties only** (RTL-safe for ar/ur).
No frameworks. Dark theme is the only theme (no light toggle in v1).

## 1. Design tokens

```
--bg        #202124   (page + header)
--surface   #303134   (search bar, buttons; row bg #1d1f22)
--border    #5f6368
--text      #e8eaed   (primary)   --text-dim #9aa0a6  (icons, secondary)
--error     #f28b82   --accent    #8ab4f8  (focus ring, flash glow)
--gutter    #7d8590   (line numbers)
--logo      #dce7fa   (wordmark — solid off-white since 2026-09-20)
--row-h     16px      (fixed log row height; 13px/16px ui-monospace)
```

## 2. Layout (single column, centered max-width 720px — EXCEPT result window)

```
<header>  full-width row: wordmark CENTERED above the search bar (≤ 92px tall);
          Language pinned to the far top-right corner of the screen (RTL mirror)
<div id="errorSlot" role="alert" aria-live="polite">          (only when active)
<main>    [search bar: 🔍 icon | input | 🔍 submit button]
          [ Reset ]  [ Upload ]        (12px gap, centered)
<section id="results">                   (always visible; empty state = paste area)
   [view bar: status text left + Word Wrap checkbox right]   (always visible;
    the status side is hidden until content loads — B18)
   [paste area: textarea, faint placeholder THIS/THAT]  (empty state only)
   [log viewport: gutter + virtualized rows, CSS-resizable]   (content state only)
</section>
<footer>  nav links (6 pages) + footer.note
```

- Header: full-width row (720px exception, like #results — user request
  2026-09-20); padding 16px inline; logo vertically + horizontally centered.
- **Logo**: text wordmark `SimpleLogSearch`, weight 500, system font, solid
  off-white `#dce7fa` (2026-09-20 user request — the Google multicolor cycle
  is retired; one span/char stays in the DOM). **Never i18n'd.** Rendered
  height capped at **92px**: font-size scales with viewport width via clamp so
  the logo never exceeds 92px tall and never collides with the corner language
  field (≈ 560px of horizontal corner zone reserved — 2 × worst-case locale
  label + select + margin; full cap reached at ≥ ~1278px viewports). `<a href="index.html">`
  with `aria-label="SimpleLogSearch"`.
- **Language select**: native `<select>`, 14px, `background:#202124;
  color:#e8eaed; border:1px solid #5f6368; border-radius:8px; padding:6px 8px;`
  visible label "Language" before it (i18n `lang.label`). Pinned to the far
  top-right corner of the screen (absolute in the header, vertically centered;
  mirrors to the top-left in ar/ur). On < 720px it stacks as its own row above
  the centered logo.
- **Search bar**: `height:46px; border-radius:24px; background:#303134;
  display:flex; align-items:center;` left magnifier SVG 20px `#9aa0a6`, margin
  start 12px; input transparent, 16px, `::placeholder #9aa0a6`; right submit
  button (magnifier, 40×40 hit area). Focus-within: `box-shadow:0 1px 6px
  rgba(32,33,36,.6)` + border `#8ab4f8`. Hover without focus: same shadow.
- **Buttons**: `height:36px; padding:0 16px; border-radius:4px;
  background:#303134; color:#e8eaed; font-size:14px; border:1px solid #303134;`
  hover `background:#3c4043`; active translateY(1px). Order: Reset, then Upload.
- **Error slot**: between header and search bar; `color:#f28b82; font-size:14px;
  margin-bottom:8px;` one line max (truncates). Auto-dismiss after 6 s or on
  next successful action; Esc also clears it.
- **Index-only, between #results and the footer**: the article content ("About
  This Tool") lives in a collapsed native `<details>` (closed by default; summary
  i18n `about.title`) — see spec/seo-adsense §1.1.

## 3. Upload flash ("momentary light-up")

```
@keyframes uploadFlash {
  0%,100% { box-shadow:none; border-color:#303134 }
  50%     { box-shadow:0 0 0 4px rgba(138,180,248,.55); border-color:#8ab4f8 }
}
.uploading-flash { animation: uploadFlash .5s ease-in-out 3; }   /* ~1.5 s total */
```
Trigger: add class + error message together; remove class on `animationend`.

## 4. Result window (`#results`)

- Container: `width:100%;` full browser width (no max-width), margin-top 24px.
- View bar + status row (2026-09-25, B18): the row just above the text box is
  a flex bar (`#viewBar`, 13px `#9aa0a6`, padding 8px 4px) that is ALWAYS
  visible. Left: the status text (`#statusRow`; content per i18n status keys —
  `loaded`/`loading` for whole-log views, `matched` for a search with hits,
  `matchedAny` for the zero-hit AND fallback (query-language §2: no line
  contained every term, so lines matching any positive term are shown — all
  NOT exclusions still applied), `noMatches` for an empty result;
  double-clicking it re-focuses the search input) — hidden in the empty state
  (no content loaded). Right: the Word Wrap checkbox (next bullet). In the
  empty state only the checkbox shows.
- **Word wrap (user request 2026-09-25 — B18)**: a native checkbox labeled
  "Word Wrap" (i18n `view.wordWrap`) at the inline-end of the view bar. It
  applies to the rendered log view only — the paste box stays no-wrap.
  Checked → `.lc` switches to `white-space:pre-wrap` with long space-less
  tokens breaking mid-token (`overflow-wrap:anywhere`); rows take variable
  height (visual lines × 16px, gutter number on the first visual line only);
  the spacer carries the sum of row heights — virtualization stays intact
  (per-line heights computed arithmetically from the monospace advance, then
  corrected per visible row by measured offsetHeight). Unchecked → the fixed
  16px no-wrap rendering above. Default unchecked; never persisted (always
  off on load). Toggling scrolls to line 1 (row offsets change). Original
  line numbers are unchanged in both modes.
- Viewport: `overflow:auto; resize:vertical;` **initial height = 20 rows ≈
  344px** (20 × 16px + padding); `min-height:80px; max-height:90vh;`
  bottom-right corner grip rendered as a CSS gradient triangle (decorative —
  the actual drag-resize is native `resize: vertical`).
- Rows: fixed 16px height; **virtualized** — only visible slice + 10-row
  overscan in the DOM; total height set on a spacer element
  (`rows.length * 16px`). Each row: `display:flex` → `.ln` (gutter) +
  `.lc` (content).
- Gutter `.ln`: right-aligned; width = max-digits × 1ch + 12px inline padding
  (recomputed on setLines); `color:#7d8590; user-select:none;
  position:sticky; inset-inline-start:0; background:#1d1f22;` — sticky so
  numbers stay visible during horizontal scroll of long lines.
- Content `.lc`: `white-space:pre; color:#e8eaed; font:13px/16px ui-monospace,
  SFMono-Regular, Menlo, Consolas, monospace;` long lines → horizontal scroll
  (no wrap). Empty log lines render a zero-width space to keep row height.
- **Original line numbers always**: gutter shows `index+1` of the *loaded
  file*; when showing matches, the gutter shows each match's original number
  (never renumbered 1..N).
- Scroll to top on every new search / reset / file load.
- **Live highlight preview (user request 2026-09-22 — B16)**: with content
  loaded, while typing in the search input (no submit), the visible rows
  highlight every case-insensitive occurrence of each **positive atom**
  (quoted phrases + bare terms; subtrees under `NOT` are never highlighted)
  as a `<mark class="hl">` span — but only when the trimmed query is **> 3
  characters** and parses cleanly. The preview is viewport-only (virtualization
  — no whole-file scan per keystroke) and never runs the search: no match
  filtering, no status-row change until Enter (B6/B7 semantics untouched).
  ≤ 3 chars trimmed, no content loaded, or a mid-typing parse error
  (unterminated quote / dangling operator) → no highlight (marks cleared).
  Marks persist across scroll and survive submit (the input keeps the query);
  they are cleared on file load / paste commit (B9 clears the input) and on
  Reset (B8).
- **Paste area (empty state, user request 2026-09-20)**: from first paint
  `#results` is visible; with no content loaded it shows `<textarea id="pasteArea">`
  styled like the viewport (bg #1d1f22, 13px/16px mono, initial height 344px,
  min 80px / max 90vh) while the viewport is hidden. Placeholder = two faint
  lines `THIS` / `THAT` in `#9aa0a6` (same token as input placeholders; i18n
  `log.placeholder` — literal demo data, identical in every locale). Pasted or
  typed text commits on the paste event or a ~500 ms typing pause: loaded
  exactly like an upload named `snippet` (first line = line 1; trailing-newline
  rule as for files), textarea hidden + cleared, viewport shown from line 1,
  status `loaded`, focus moves to the search input. Reset with a snippet loaded
  returns to this empty state (B15).

## 5. Behavior matrix (authoritative — CHECKLIST verifies every row)

| # | State | Action | Result |
|---|---|---|---|
| B1 | no file | submit search (any text) | Upload button flashes; error slot shows `✕ Upload Log File before searching`; input kept; paste area stays in the empty state |
| B2 | no file | click Reset | nothing happens (no error, no state change); uncommitted paste-area text, if any, is cleared |
| B3 | no file | Upload → pick valid file | full log shown in the window from line 1 (the window was already visible), status `loaded` |
| B4 | no file | Upload → cancel picker | nothing changes |
| B5 | no file | pick file > 50 MB | error slot `fileTooLarge`; paste area stays in the empty state; previous load untouched |
| B6 | file loaded | submit valid query | only matches shown; original line numbers; status `matched`/`noMatches`; scroll top |
| B7 | matches shown | submit new query | same window updates to new matches |
| B8 | file loaded (any view) | click Reset | input cleared; **entire log** shown again; status `loaded`; error cleared |
| B9 | file A loaded | upload file B | file A fully discarded; window shows file B from line 1; query cleared |
| B10 | file loaded | submit empty/whitespace query | all lines shown; no error (same as reset view) |
| B11 | matches shown | submit invalid query | error slot `invalidQuery` + detail; previous matches stay visible |
| B12 | any | Esc in search input | clears error slot only; input text kept |
| B13 | big file, read > ~200 ms | during read | status shows `loading` for filename; UI stays responsive (async read) |
| B14 | empty state | paste or type text into the paste area | commits as a log named `snippet`: whole text from line 1; textarea hidden (placeholder gone); status `loaded` |
| B15 | snippet loaded | click Reset | back to the empty state: textarea + placeholder shown; search input cleared; no log in state |
| B16 | content loaded | type in the search box (no submit) | trimmed query > 3 chars AND parses → every visible row highlights case-insensitive occurrences of each positive atom as `<mark class="hl">` (NOT subtrees never highlighted); ≤ 3 chars, no content, or mid-typing parse error → no highlight; the search is NOT run — filtering + status still wait for Enter |
| B17 | file loaded | submit a query whose strict result is empty but at least one line matches a positive term (zero-hit AND fallback — query-language §2) | lines matching any positive term shown, all `NOT` exclusions still applied; original line numbers; status `matchedAny` ("no line contains all terms" notice); scroll top. When the loose result is also empty → plain B6 no-match view |
| B18 | content loaded (or empty state) | toggle the Word Wrap checkbox | the checkbox is always visible at the inline-end of the view bar (empty state: it is the only thing shown). With content: checked → `.lc` wraps at the viewport width, rows variable height (visual lines × 16px), gutter number on the first visual line only, spacer = sum of row heights, no horizontal overflow; unchecked → fixed 16px no-wrap restored. Toggling scrolls to line 1; original line numbers never renumbered; default off on load, never persisted |

## 6. Keyboard & a11y

- Enter in input = submit (form). `/` focuses search when focus is not already
  in an input. Esc per B12.
- Error slot `role=alert`; status row `aria-live=polite`.
- Icon-only buttons get aria-labels (`search.buttonAria`). Viewport labeled via
  `a11y.logView`; skip-link `a11y.skipToResults` targets it.
- Contrast: all token pairs ≥ 4.5:1 on `#202124`.

## 7. Responsive

- ≥ 720px: as specified above (single full-width header row: centered logo,
  corner language field).
- < 720px: header stacks into two rows — language field top-right, centered
  logo below it at mobile scale (≤ 72px); buttons stay centered under the bar;
  result window keeps full width; gutter width auto-fits; everything remains
  usable (resize handle less convenient on touch — accepted).
