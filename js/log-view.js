// SimpleLogSearch — js/log-view.js (CHECKLIST 2.1)
// Virtualized log line view for #logViewport, per spec/ui-spec §4.
//
// API (classic deferred script → window.LogView; consumed by app.js from
// CHECKLIST 2.2 on):
//   const lv = LogView.create(document.getElementById("logViewport"));
//   lv.setLines(lines)             // string[] — show the whole file from line 1
//   lv.showMatches(indexes0based)  // show only those lines; the gutter keeps
//                                  // each match's ORIGINAL number (never
//                                  // renumbered 1..N)
//   lv.scrollToTop()               // every new search / reset / file load
//                                  // starts at line 1 (§4)
 //   lv.setHighlight(terms)         // string[] of pre-lowercased atoms — visible rows wrap
 //                                  // case-insensitive occurrences in <mark class="hl">
 //                                  // (live preview, §4/B16); viewport-only by design
 //   lv.clearHighlight()            // drop the preview marks (§4/B16)
 //   lv.setWrap(on)                // word-wrap mode (§4/B18): .lc wraps at the
 //                                  // viewport width, rows take variable height
 //                                  // (visual lines × 16px); off = fixed 16px
 //                                  // no-wrap (the default)
//
// Rendering (§4): fixed 16px rows; a .log-spacer element carries the total
// height (rows.length × 16px); only the visible slice + 10-row overscan is
// kept in the DOM (re-rendered on scroll/resize via rAF). Each row is
// display:flex → .ln (sticky gutter) + .lc (no-wrap content; empty lines
// render a ZWSP to keep the 16px line box). Gutter width = max-digits × 1ch
// (+ 12px padding from CSS), recomputed on setLines. Pure DOM — no deps,
// no storage, no network.
(function () {
  "use strict";

  const ROW_H = 16;     // px — fixed row height (ui-spec §4 / --row-h)
  const OVERSCAN = 10;  // rows kept in the DOM above/below the visible slice
  const ZWSP = "\u200B";// keeps an empty line's 16px line box (§4)

  function create(viewport) {
    if (!viewport || typeof viewport.appendChild !== "function") {
      throw new TypeError("LogView.create: a viewport element is required");
    }
    if (viewport.querySelector(":scope > .log-spacer")) {
      throw new Error("LogView.create: viewport already has a log view");
    }

    const spacer = document.createElement("div");
    spacer.className = "log-spacer";
    spacer.style.height = "0px";
    viewport.appendChild(spacer);

    let lines = [];     // strings of the loaded file (original text)
    let view = [];      // original 0-based indexes currently shown (all or matches)
    let gutterW = "3ch";// .ln width — recomputed on setLines (§4)
    let hlRegex = null; // §4/B16 live preview — combined case-insensitive alternation of the highlight atoms, or null
    let queued = false;
    let wrap = false;     // B18 — word-wrap mode (variable row heights)
    let hCache = null;    // number[] px height per view index (wrap mode only; built lazily)
    let off = null;       // number[] prefix sums of hCache — row tops (view.length+1)
    let tableW = -1;      // content width the height table was built at
    let charW = 0;        // measured px advance of one .lc monospace char (once)

    function contentWidth() {
      const cs = getComputedStyle(viewport);
      return viewport.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    }

    // B18 — visual lines a logical line occupies when .lc wraps at `cpl` chars.
    // Greedy word wrap matching CSS white-space:pre-wrap: breaks happen between
    // words, the whitespace run at a break seam is consumed whole, mid-line
    // spaces keep their columns, tabs align to 8-char stops, tokens longer than
    // one line hard-break every cpl chars, and trailing whitespace at end of
    // text never opens a new visual line. The font is monospace, so column math
    // is exact for it; the post-render offsetHeight correction in render()
    // absorbs any exotic-glyph drift.
    function wrapCount(text, cpl) {
      if (text === "") return 1;
      const isWS = (c) => c === 32 || c === 9;
      let rows = 1, col = 0, i = 0;
      const n = text.length;
      while (i < n) {
        if (isWS(text.charCodeAt(i))) {
          let j = i + 1;
          while (j < n && isWS(text.charCodeAt(j))) j++;
          if (col > 0 && j < n) { // mid-line run that can actually wrap
            let wrapped = false;
            for (let k = i; k < j; k++) {
              const cc = text.charCodeAt(k);
              col = (cc === 9) ? ((col >> 3) + 1) << 3 : col + 1;
              if (col > cpl) { wrapped = true; break; }
            }
            if (wrapped) { rows++; col = 0; }
          }
          i = j;
        } else {
          let j = i + 1;
          while (j < n && !isWS(text.charCodeAt(j))) j++;
          const len = j - i;
          if (col + len <= cpl) {
            col += len;
          } else {
            rows++;                    // the word starts on a fresh visual line
            if (len >= cpl) {          // token longer than a line: hard-break it
              rows += Math.ceil(len / cpl) - 1;
              col = len % cpl;
            } else {
              col = len;
            }
          }
          i = j;
        }
      }
      return rows;
    }

    function measureCharWidth() {
      if (charW > 0) return charW;
      const probe = document.createElement("span");
      probe.className = "lc";
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;width:max-content;";
      probe.textContent = "0".repeat(100);
      viewport.appendChild(probe);
      charW = probe.offsetWidth / 100; // the .lc font stack resolved (13px mono)
      viewport.removeChild(probe);
      if (!(charW > 0)) charW = 7.8;   // fallback ≈ typical 13px monospace advance
      return charW;
    }

    // B18 — height table for the CURRENT view at the current content width:
    // hCache[i] = px height of row i (visual lines × ROW_H); off[] = prefix
    // sums (row tops, off[0] = 0). Pure math over the text — no DOM, so it
    // stays fast for 100k-line files. Rebuilt when the view or the viewport
    // width changes (render() compares tableW), then corrected per visible
    // row by measured offsetHeight (see render()).
    function buildTable() {
      const ch = measureCharWidth();
      tableW = contentWidth();
      const digits = String(lines.length).length;       // gutter width source (§4)
      const cpl = Math.max(1, Math.floor((tableW - (digits * ch + 12)) / ch));
      hCache = new Array(view.length);
      off = new Array(view.length + 1);
      off[0] = 0;
      for (let i = 0; i < view.length; i++) {
        const src = view[i];
        const raw = (src == null || src >= lines.length) ? "" : lines[src];
        hCache[i] = wrapCount(raw, cpl) * ROW_H;
        off[i + 1] = off[i] + hCache[i];
      }
    }

    function invalidateTable() { hCache = null; tableW = -1; }

    // Builds one row element for view index i (sticky gutter + content incl.
    // the B16 highlight marks); returns null for an out-of-range source index.
    // The caller sets position/height: nowrap → fixed 16px at i × ROW_H;
    // wrap → off[i] with hCache[i].
    function buildRow(i) {
      const src = view[i];                 // original file index of row i
      if (src == null || src >= lines.length) return null;

      const row = document.createElement("div");
      row.className = "log-row";

      const ln = document.createElement("span");
      ln.className = "ln";
      ln.style.width = gutterW;
      ln.textContent = src + 1;            // ORIGINAL number (1-based)

      const lc = document.createElement("span");
      lc.className = "lc";
      const raw = lines[src];
      if (raw == null || raw === "") {
        lc.textContent = ZWSP;
      } else if (!hlRegex) {
        lc.textContent = raw;
      } else {
        // §4/B16 live highlight preview: wrap case-insensitive occurrences of the
        // highlight atoms in <mark class="hl">. Node-based (no innerHTML) so
        // arbitrary log text needs no escaping; viewport-only by construction
        // (virtualization never keeps more rows in the DOM than visible+overscan).
        const frag = document.createDocumentFragment();
        let last = 0;
        for (const m of raw.matchAll(hlRegex)) {
          if (m.index > last) frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
          if (m[0] !== "") { // defensive — atoms are ≥1 char, but never emit an empty <mark>
            const mk = document.createElement("mark");
            mk.className = "hl";
            mk.textContent = m[0];
            frag.appendChild(mk);
          }
          last = m.index + m[0].length;
        }
        if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
        lc.appendChild(frag);
      }

      row.appendChild(ln);
      row.appendChild(lc);
      return row;
    }

    function render() {
      queued = false;
      const total = view.length;
      const vh = viewport.clientHeight; // includes the 2 × 12px vertical padding

      if (wrap) {
        // B18 — variable-height virtualization: row tops come from the
        // prefix-sum table; only the visible slice + overscan is in the DOM.
        if (total === 0) { spacer.style.height = "0px"; spacer.textContent = ""; return; }
        if (!hCache || tableW !== contentWidth()) buildTable(); // view or width changed
        spacer.style.height = off[total] + "px";
        if (vh <= 0) { spacer.textContent = ""; return; }

        const padTop = parseFloat(getComputedStyle(viewport).paddingTop) || 0;
        const s = viewport.scrollTop;
        const y0 = s - padTop;              // a visible row must end below y0
        const y1 = s + vh - padTop;         // and start above y1
        let lo = 0, hi = total;             // first: smallest i with off[i+1] > y0
        while (lo < hi) { const m = (lo + hi) >> 1; if (off[m + 1] > y0) hi = m; else lo = m + 1; }
        const first = lo;
        if (first >= total) { spacer.textContent = ""; return; } // scrolled past bottom
        lo = 0; hi = total;                 // last: largest i with off[i] < y1
        while (lo < hi) { const m = (lo + hi) >> 1; if (off[m] < y1) lo = m + 1; else hi = m; }
        const last = Math.max(first, lo - 1);

        const start = Math.max(0, first - OVERSCAN);
        const end = Math.min(total, last + 1 + OVERSCAN);

        spacer.textContent = "";            // drop the old slice
        const frag = document.createDocumentFragment();
        const placed = [];                  // [{ i, el }] — in slice order
        for (let i = start; i < end; i++) {
          const row = buildRow(i);
          if (!row) continue;
          row.style.insetBlockStart = off[i] + "px";
          row.style.height = hCache[i] + "px";
          frag.appendChild(row);
          placed.push({ i: i, el: row });
        }
        spacer.appendChild(frag);

        // Self-correction: if CSS wrapped a visible row into a different number
        // of visual lines than the monospace math predicted (exotic glyph
        // widths), adopt the measured height, rebuild the suffix of off[] and
        // reposition once. The slice content is unchanged, so this converges
        // in a single extra pass.
        let drift = false, minDrift = total;
        for (const p of placed) {
          const actual = Math.max(ROW_H, Math.round(p.el.offsetHeight));
          if (actual !== hCache[p.i]) {
            hCache[p.i] = actual;
            if (p.i < minDrift) minDrift = p.i;
            drift = true;
          }
        }
        if (drift) {
          for (let i = minDrift; i < total; i++) off[i + 1] = off[i] + hCache[i];
          spacer.style.height = off[total] + "px";
          queueRender();
        }
        return;
      }

      spacer.style.height = total * ROW_H + "px"; // §4: rows.length × 16px

      if (vh <= 0 || total === 0) { spacer.textContent = ""; return; }

      const padTop = parseFloat(getComputedStyle(viewport).paddingTop) || 0;
      const s = viewport.scrollTop;
      const first = Math.max(0, Math.floor((s - padTop) / ROW_H));
      const last = Math.min(total - 1, Math.ceil((s + vh - padTop) / ROW_H) - 1);
      if (last < first) { spacer.textContent = ""; return; }

      const start = Math.max(0, first - OVERSCAN);
      const end = Math.min(total, last + 1 + OVERSCAN);

      // Preserve the horizontal position: clearing the slice momentarily
      // shrinks the scrollable width and the browser would clamp scrollLeft
      // to 0 (a right-scrolled view snapping left on every vertical scroll).
      const savedScrollX = viewport.scrollLeft;
      spacer.textContent = ""; // drop the old slice
      const frag = document.createDocumentFragment();
      for (let i = start; i < end; i++) {
        const row = buildRow(i);
        if (!row) continue;
        row.style.insetBlockStart = i * ROW_H + "px";
        frag.appendChild(row);
      }
      spacer.appendChild(frag);
      viewport.scrollLeft = savedScrollX; // clamps if the new slice is narrower
    }

    function queueRender() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(render);
    }

    viewport.addEventListener("scroll", queueRender, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      // native resize drag changes clientHeight without a scroll event; also
      // fires when #results is unhid (0 → real size) after setLines.
      new ResizeObserver(queueRender).observe(viewport);
    } else {
      window.addEventListener("resize", queueRender);
    }

    return {
      setLines(all) {
        lines = Array.prototype.slice.call(all || []);
        view = lines.map((_, i) => i);         // full file, line 1 first
        gutterW = String(lines.length).length + "ch"; // max-digits × 1ch (§4)
        invalidateTable();                     // B18 — the height table belongs to the old view
        viewport.scrollTop = 0;                // file load → top (§4)
        queueRender();
      },
      showMatches(indexes) {
        view = Array.prototype.slice.call(indexes || []);
        invalidateTable();                     // B18 — same (new view set)
        viewport.scrollTop = 0;                // new search → top (§4)
        queueRender();
      },
      scrollToTop() {
        viewport.scrollTop = 0;                // fires scroll → re-render
      },
      setHighlight(terms) {
        const list = Array.prototype.filter.call(terms || [], (t) => typeof t === "string" && t !== "");
        if (list.length === 0) {
          hlRegex = null;
        } else {
          // Longest first so the longer atom wins when two terms start at the same
          // offset. Atoms arrive pre-lowercased (query-parser ATOM nodes); 'i' makes
          // them match the original-case line text case-insensitively (§2).
          const escaped = list.slice().sort((a, b) => b.length - a.length)
            .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          hlRegex = new RegExp(escaped.join("|"), "gi");
        }
        queueRender();
      },
      clearHighlight() { this.setHighlight([]); },
      setWrap(on) {
        // B18 — word-wrap mode. Row offsets change wholesale, so (like a new
        // search/load per §4) the view returns to line 1.
        wrap = on === true;
        if (wrap) viewport.classList.add("wrap");
        else viewport.classList.remove("wrap");
        invalidateTable();
        viewport.scrollTop = 0;
        queueRender();
      },
    };
  }

  window.LogView = { create };
})();

