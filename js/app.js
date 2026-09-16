// SimpleLogSearch — js/app.js
// App-shell behaviors (CHECKLIST 1.4) + upload flow (CHECKLIST 2.2, B3/B5/B13):
// language change → apply + persist (+ re-render the dynamic status row);
// Reset with no file loaded = strict no-op (B2); Upload click opens the picker,
// cancel = nothing (B4); a picked file is size-validated (≤ 50 MB, else
// err.fileTooLarge — B5), read asynchronously via file.text() with status
// `loading` (B13) and split on \r?\n (one trailing empty element dropped when
// the file ends with a newline); lines[] plus a one-time linesLower[] copy stay
// in state and the whole file renders from line 1 through LogView (2.1) into
// the unhid #results with status `loaded` and the error slot cleared; search
// submit with no file → flash Upload + err.noFile (B1); Esc clears the error
// slot only (B12); `/` focuses the search input.
//
// Classic deferred script (no framework, no build): loaded after js/i18n.js,
// js/query-parser.js and js/log-view.js in index.html, so window.I18N,
// window.QueryParser and window.LogView exist and the
// DOM is already parsed. Error-slot rules per spec/ui-spec §2 (auto-dismiss
// after 6 s; Esc clears; the next successful action clears — loadFile() calls
// clearError() on success); flash per §3; status row + viewport per §4;
// keyboard per §6. Replace semantics (B9, CHECKLIST 2.3): a successful upload
// discards the previous arrays by reassignment, clears the search input and
// shows the new file from line 1. Reset-with-file (B8 — CHECKLIST 2.4)
// clears input + error, re-shows the entire log from line 1 with status `loaded`;
// an empty/whitespace submit with a file loaded shows the whole log again, no
// error (B10 — CHECKLIST 2.5); search submit with a file loaded runs the
// query through window.QueryParser (CHECKLIST 3.4): parse → compile once →
// single pass over linesLower → showMatches(0-based) + status
// matched/noMatches (B6/B7); a parse error shows err.invalidQuery {detail}
// with the previous view untouched (B11); a ?q= URL param prefills the input
// on load only — never auto-runs (SearchAction support).

(function () {
  "use strict";

  const I18N = window.I18N;
  const QueryParser = window.QueryParser; // js/query-parser.js (CHECKLIST 3.4)

  // --- DOM handles ----------------------------------------------------------
  const langSelect = document.getElementById("langSelect");
  const errorSlot = document.getElementById("errorSlot");
  const searchForm = document.querySelector("form.search-bar");
  const searchInput = document.querySelector("input.search-input");
  const resetBtn = document.getElementById("resetBtn");
  const uploadBtn = document.getElementById("uploadBtn");
  const fileInput = document.getElementById("fileInput");
  const results = document.getElementById("results");
  const statusRow = document.getElementById("statusRow");

  // Result-window view (CHECKLIST 2.1): drives #logViewport from here on.
  const logView = LogView.create(document.getElementById("logViewport"));

  // --- State ------------------------------------------------------------------
  // file/lines/linesLower: the currently loaded log (CHECKLIST 2.2) — the
  // arrays are replaced wholesale by reassignment on each successful load.
  // status: the last rendered status row, so a language change can re-render it;
  // search results live there too — status.matched/noMatches params carry
  // file/total/matches/query, so nothing else is stored between searches.
  const state = {
    file: null,       // File of the loaded log (null until first successful load)
    lines: null,      // string[] — original text lines
    linesLower: null, // string[] — lowercase copy, built ONCE per load
    status: null,     // { key, params } of the last rendered status row
  };

  // --- Error slot (ui-spec §2) --------------------------------------------------
  // Auto-dismiss after 6 s; Esc clears it; the next successful action clears
  // it (Phases 2–3 call clearError() on load/search success).
  const ERROR_TTL_MS = 6000;
  let errorTimer = null;

  function showError(key, params) {
    if (errorTimer !== null) clearTimeout(errorTimer);
    errorSlot.textContent = I18N.t(I18N.locale(), key, params);
    errorSlot.hidden = false;
    errorTimer = setTimeout(clearError, ERROR_TTL_MS);
  }

  function clearError() {
    if (errorTimer !== null) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
    errorSlot.textContent = "";
    errorSlot.hidden = true;
  }

  // --- Status row (ui-spec §4; spec/i18n status.* keys) -------------------------
  // index.html gives #statusRow data-i18n="status.noFile" for pre-app paint;
  // once a file is loaded the app owns the text and I18N.apply() would clobber
  // it back to noFile on every language change — renderStatus() re-renders the
  // current status right after each apply (see the langSelect listener).
  function setStatus(key, params) {
    state.status = { key: key, params: params || {} };
    renderStatus();
  }

  function renderStatus() {
    if (!state.status) return;
    statusRow.textContent = I18N.t(I18N.locale(), state.status.key, state.status.params);
  }

  // --- Upload flash (ui-spec §3) --------------------------------------------------
  // "add class + error message together; remove class on animationend."
  // The reflow restart lets a second no-file submit inside the ~1.5 s window
  // flash again from 0%.
  function flashUpload() {
    uploadBtn.classList.remove("uploading-flash");
    void uploadBtn.offsetWidth; // force reflow → restart the animation
    uploadBtn.classList.add("uploading-flash");
    uploadBtn.addEventListener("animationend", function onEnd() {
      uploadBtn.classList.remove("uploading-flash");
      uploadBtn.removeEventListener("animationend", onEnd);
    });
  }

  // --- Language (spec/i18n §4) ------------------------------------------------------
  // change → I18N.apply(value): sets every string, <html lang|dir> and
  // persists sls-lang (persistence lives inside apply). Boot sync: the
  // pre-paint script + i18n.js already applied the stored locale; mirror it
  // into the dropdown (its default selection is "en").
  langSelect.addEventListener("change", function () {
    I18N.apply(langSelect.value);
    renderStatus(); // dynamic status must survive the apply() clobber (above)
  });
  langSelect.value = I18N.locale();

  // --- Reset ---------------------------------------------------------------------------
  // B2 (no file — CHECKLIST 1.4): strict no-op — no error, no state change.
  // B8 (file loaded, any view — CHECKLIST 2.4): clear the search input and the
  // error slot, show the entire log again from line 1 (setLines resets the view
  // to the whole file and scrolls to top per §4), status `loaded` for the same file.
  resetBtn.addEventListener("click", function () {
    if (!state.file) return; // B2 — strict no-op: no error, no state change
    searchInput.value = ""; // B8 — input cleared
    logView.setLines(state.lines); // entire log again, from line 1 (§4 scroll top)
    setStatus("status.loaded", { file: state.file.name, lines: state.lines.length });
    clearError(); // B8 — error cleared
  });

  // --- Upload flow (CHECKLIST 2.2 — B3/B5/B13; ui-spec §4) -------------------------------
  // Valid pick → status `loading` → async read → split on \r?\n (one trailing
  // empty element dropped when the file ends with a newline) → whole file from
  // line 1 through LogView → #results unhid (stays visible thereafter) →
  // status `loaded`, error slot cleared. The size guard runs first: an
  // oversized pick changes nothing (B5 — window stays hidden, previous load
  // untouched; state is committed only after a successful read). On success a
  // replace also clears the search input (B9 — CHECKLIST 2.3).
  const MAX_FILE_BYTES = 50 * 1024 * 1024; // "≤ 50 MB" → err.fileTooLarge

  async function loadFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showError("err.fileTooLarge"); // B5 — nothing else is touched
      return;
    }
    setStatus("status.loading", { file: file.name }); // B13 — visible during the read
    try {
      const text = await file.text(); // async read — UI stays responsive (B13)
      const lines = text.split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop(); // file ends with a newline → drop one trailing empty element
      }
      state.file = file;
      state.lines = lines;
      state.linesLower = lines.map((l) => l.toLowerCase()); // built ONCE (Phase 3 searches over this — query-language §2)
      searchInput.value = "";   // B9 — replace clears any previous query
      logView.setLines(lines);   // whole file from line 1, scrolled to top (§4)
      results.hidden = false;    // after setLines → ResizeObserver sees the real size (2.1)
      setStatus("status.loaded", { file: file.name, lines: lines.length });
      clearError();              // next successful action clears the error slot (§2)
    } catch (e) {
      // Read failure (spec/i18n err.readFile): the previous load — if any — is
      // untouched (setLines only runs on success), so just restore its status.
      showError("err.readFile");
      if (state.file && state.lines) {
        setStatus("status.loaded", { file: state.file.name, lines: state.lines.length });
      }
    }
  }

  uploadBtn.addEventListener("click", function () {
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    const picked = fileInput.files && fileInput.files[0];
    if (picked) void loadFile(picked); // B4 — cancelled picker → no files → nothing changes
    fileInput.value = ""; // allow re-selecting the same file later (B9, CHECKLIST 2.3)
  });

  // ui-spec §4: double-clicking the status row re-focuses the search input
  // (deferred from CHECKLIST 2.1 — app territory, lands here with app.js
  // taking ownership of the status row).
  statusRow.addEventListener("dblclick", function () {
    searchInput.focus();
  });

  // --- ?q= URL param (CHECKLIST 3.4 — SearchAction support) -------------------------------
  // On load only: prefill the search input and do nothing else — never
  // auto-run (no file is present at load time; a run would just be B1). The
  // Phase-5 WebMCP SearchAction hands the user this same URL shape.
  {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q !== null) searchInput.value = q;
  }

  // --- Search submit ------------------------------------------------------------------------
  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!state.file) {
      flashUpload();
      showError("err.noFile"); // "✕ Upload Log File before searching"
      // B1: input kept, #results stays hidden — neither is touched here.
      return;
    }
    const query = searchInput.value.trim();
    if (query === "") {
      // CHECKLIST 2.5 (B10): empty/whitespace query with a file loaded → the
      // entire log again, no error — the same view as B8's reset (setLines
      // resets to all lines and scrolls to top per §4), status `loaded`; the
      // input itself is left as-is.
      logView.setLines(state.lines);
      setStatus("status.loaded", { file: state.file.name, lines: state.lines.length });
      clearError();
      return;
    }
    // CHECKLIST 3.4 (B6/B7/B11 — spec/query-language §2/§3): parse → compile
    // ONCE per search → single pass over the pre-lowercased lines → 0-based
    // indexes. LogView shows the matches with ORIGINAL line numbers and
    // scrolls to top (ui-spec §4); status matched/noMatches (B6); a later
    // submit updates this same window in place (B7).
    try {
      const ast = QueryParser.parseQuery(query); // throws QueryParseError on any §3 error
      const predicate = QueryParser.compile(ast);
      const indexes = QueryParser.run(predicate, state.linesLower);
      logView.showMatches(indexes);
      if (indexes.length > 0) {
        setStatus("status.matched", { file: state.file.name, total: state.lines.length, matches: indexes.length, query: query });
      } else {
        setStatus("status.noMatches", { file: state.file.name, total: state.lines.length, query: query });
      }
      clearError(); // next successful action clears the error slot (ui-spec §2)
    } catch (e) {
      if (e && e.name === "QueryParseError") {
        // B11 — the search did not run; the previous view stays untouched.
        // {detail} = the parser's exact English string, never translated (i18n §2).
        showError("err.invalidQuery", { detail: e.detail });
      } else {
        throw e; // non-parser failure — never swallow it silently
      }
    }
  });

  // --- Keyboard (ui-spec §6) --------------------------------------------------------------------
  // `/` focuses search when focus is not already in an editable; Esc clears
  // the error slot only (B12 — input text kept).
  function isEditable(el) {
    if (!el || !el.tagName) return false;
    const tag = String(el.tagName).toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      clearError();
    } else if (e.key === "/" && !isEditable(document.activeElement)) {
      e.preventDefault(); // don't type the slash into the page
      searchInput.focus();
    }
  });
})();

