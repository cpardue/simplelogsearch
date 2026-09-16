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
    let queued = false;

    function render() {
      queued = false;
      const total = view.length;
      spacer.style.height = total * ROW_H + "px"; // §4: rows.length × 16px

      const vh = viewport.clientHeight; // includes the 2 × 12px vertical padding
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
        const src = view[i];                 // original file index of row i
        if (src == null || src >= lines.length) continue;

        const row = document.createElement("div");
        row.className = "log-row";
        row.style.insetBlockStart = i * ROW_H + "px";

        const ln = document.createElement("span");
        ln.className = "ln";
        ln.style.width = gutterW;
        ln.textContent = src + 1;            // ORIGINAL number (1-based)

        const lc = document.createElement("span");
        lc.className = "lc";
        const raw = lines[src];
        lc.textContent = raw == null || raw === "" ? ZWSP : raw;

        row.appendChild(ln);
        row.appendChild(lc);
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
        viewport.scrollTop = 0;                // file load → top (§4)
        queueRender();
      },
      showMatches(indexes) {
        view = Array.prototype.slice.call(indexes || []);
        viewport.scrollTop = 0;                // new search → top (§4)
        queueRender();
      },
      scrollToTop() {
        viewport.scrollTop = 0;                // fires scroll → re-render
      },
    };
  }

  window.LogView = { create };
})();

