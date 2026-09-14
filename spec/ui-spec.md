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
--row-h     16px      (fixed log row height; 13px/16px ui-monospace)
```

## 2. Layout (single column, centered max-width 720px — EXCEPT result window)

```
<header>  [logo wordmark]  …spacer…  [Language: <select>]
<div id="errorSlot" role="alert" aria-live="polite">          (only when active)
<main>    [search bar: 🔍 icon | input | 🔍 submit button]
          [ Reset ]  [ Upload ]        (12px gap, centered)
<section id="results" hidden>            (appears after first successful upload)
   [status row: filename • lines • match count]
   [log viewport: gutter + virtualized rows, CSS-resizable]
</section>
<footer>  nav links (6 pages) + footer.note
```

- Header padding: 16px inline; logo vertically centered.
- **Logo**: text wordmark `SimpleLogSearch`, 26px, weight 500, system font;
  letters cycle Google colors [#4285F4, #EA4335, #FBBC04, #34A853] per
  character (one span/char). **Never i18n'd.** `<a href="index.html">` with
  `aria-label="SimpleLogSearch"`.
- **Language select**: native `<select>`, 14px, `background:#202124;
  color:#e8eaed; border:1px solid #5f6368; border-radius:8px; padding:6px 8px;`
  visible label "Language" before it (i18n `lang.label`).
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
- Status row: 13px `#9aa0a6`, padding 8px 4px; content per i18n status keys;
  double-clicking it re-focuses the search input.
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

## 5. Behavior matrix (authoritative — CHECKLIST verifies every row)

| # | State | Action | Result |
|---|---|---|---|
| B1 | no file | submit search (any text) | Upload button flashes; error slot shows `✕ Upload Log File before searching`; input kept; results stay hidden |
| B2 | no file | click Reset | nothing happens (no error, no state change) |
| B3 | no file | Upload → pick valid file | window appears (20 rows), full log shown, status `loaded` |
| B4 | no file | Upload → cancel picker | nothing changes |
| B5 | no file | pick file > 50 MB | error slot `fileTooLarge`; window stays hidden |
| B6 | file loaded | submit valid query | only matches shown; original line numbers; status `matched`/`noMatches`; scroll top |
| B7 | matches shown | submit new query | same window updates to new matches |
| B8 | file loaded (any view) | click Reset | input cleared; **entire log** shown again; status `loaded`; error cleared |
| B9 | file A loaded | upload file B | file A fully discarded; window shows file B from line 1; query cleared |
| B10 | file loaded | submit empty/whitespace query | all lines shown; no error (same as reset view) |
| B11 | matches shown | submit invalid query | error slot `invalidQuery` + detail; previous matches stay visible |
| B12 | any | Esc in search input | clears error slot only; input text kept |
| B13 | big file, read > ~200 ms | during read | status shows `loading` for filename; UI stays responsive (async read) |

## 6. Keyboard & a11y

- Enter in input = submit (form). `/` focuses search when focus is not already
  in an input. Esc per B12.
- Error slot `role=alert`; status row `aria-live=polite`.
- Icon-only buttons get aria-labels (`search.buttonAria`). Viewport labeled via
  `a11y.logView`; skip-link `a11y.skipToResults` targets it.
- Contrast: all token pairs ≥ 4.5:1 on `#202124`.

## 7. Responsive

- ≥ 720px: as specified above.
- < 720px: buttons stay centered under the bar; result window keeps full width;
  gutter width auto-fits; everything remains usable (resize handle less
  convenient on touch — accepted).

