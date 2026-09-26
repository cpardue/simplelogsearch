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
// matched/matchedAny/noMatches (B6/B7; §2 fallback = B17); a parse error shows err.invalidQuery {detail}
// with the previous view untouched (B11); a ?q= URL param prefills the input
// on load only — never auto-runs (SearchAction support).
 // Paste box (2026-09-20 user request — ui-spec §4/B14/B15): #results is visible
 // from first paint; the empty state shows #pasteArea (faint two-line THIS/THAT
 // demo placeholder, i18n log.placeholder) with the viewport hidden. Pasted or
 // typed text commits as a log named "snippet" through the shared commitLoad
 // path (paste event immediately, ~500 ms after a typing pause); Reset with a
 // snippet returns to the empty state (B15); an upload or sample load replaces
 // it under normal B9 semantics.

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
  const exportBtn = document.getElementById("exportBtn"); // B19 — Export Snippet (always shown; disabled outside match views)
  const fileInput = document.getElementById("fileInput");
  const results = document.getElementById("results");
  const statusRow = document.getElementById("statusRow");
  const pasteArea = document.getElementById("pasteArea"); // empty-state paste box (ui-spec §4)
  const logViewportEl = document.getElementById("logViewport");
  const wrapToggle = document.getElementById("wrapToggle"); // B18 — Word Wrap checkbox (view bar)

  // Result-window view (CHECKLIST 2.1): drives #logViewport from here on.
  const logView = LogView.create(document.getElementById("logViewport"));

  // --- Word wrap toggle (user request 2026-09-25 — ui-spec §4 / B18) -------------
  // The view-bar checkbox wraps the rendered log view only (the paste box stays
  // no-wrap). Rows gain variable height inside LogView; default unchecked and
  // never persisted (always off on load).
  wrapToggle.addEventListener("change", function () {
    logView.setWrap(wrapToggle.checked);
  });

  // --- State ------------------------------------------------------------------
  // file/lines/linesLower: the currently loaded log (CHECKLIST 2.2) — the
  // arrays are replaced wholesale by reassignment on each successful load.
  // status: the last rendered status row, so a language change can re-render it;
  // search results live there too — status.matched/noMatches params carry
  // file/total/matches/query, so nothing else is stored between searches.
  const state = {
    file: null,       // loaded log — real File (upload) or { name } descriptor (SLS.loadSample); null before first load
    lines: null,      // string[] — original text lines
    linesLower: null, // string[] — lowercase copy, built ONCE per load
    status: null,     // { key, params } of the last rendered status row
    matchIndexes: null, // 0-based indexes of the CURRENT match view — B19 export source; null in whole-log/empty views
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
  // B20 (2026-09-25): in the empty state that status.noFile paste instruction
  // stays visible above the pane; language changes re-apply it. Once a file is
  // loaded the app owns the text and I18N.apply() would clobber
  // it back to noFile on every language change — renderStatus() re-renders the
  // current status right after each apply (see the langSelect listener).
  function setStatus(key, params) {
    state.status = { key: key, params: params || {} };
    renderStatus();
    syncExportBtn(); // B19 — Export Snippet enabled state tracks the rendered status row
  }

  // B19 (ui-spec §4) — the Export Snippet button is always shown but enabled
  // exactly in match views (status matched / matchedAny — the zero-hit AND
  // fallback view exports exactly what it shows); whole-log, loading, no-match
  // and empty-state rows keep it disabled (grayed out). Driven from setStatus so
  // every view change (B6/B7/B8/B9/B10/B15, SLS paths) re-syncs it in one place.
  function syncExportBtn() {
    const s = state.status;
    exportBtn.disabled = !(s && (s.key === "status.matched" || s.key === "status.matchedAny"));
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

  // --- Paste box (ui-spec §4 — empty state; B14/B15, 2026-09-20 user request) -----
  // The empty state shows #pasteArea with a faint two-line demo placeholder
  // ("THIS" / "THAT", i18n log.placeholder). Any pasted or typed text commits the
  // textarea's content as a log named "snippet" through the shared commitLoad
  // path — on the paste event immediately, or ~500 ms after a typing pause.
  // Whitespace-only text never commits (the placeholder stays). Committing hides
  // the textarea, shows the viewport from line 1 and moves focus to the search
  // input (the natural next step: type a query).
  const PASTE_IDLE_MS = 500;
  let typeTimer = null;

  function commitPaste() {
    if (typeTimer !== null) { clearTimeout(typeTimer); typeTimer = null; }
    const text = pasteArea.value;
    if (text.trim() === "") return; // whitespace only → stay in the empty state
    state.file = { name: "snippet", pasted: true }; // descriptor — commitLoad only needs .name
    commitLoad("snippet", text); // shared success path (split/linesLower/B9/render/status)
    searchInput.focus();
  }

  pasteArea.addEventListener("paste", function () {
    setTimeout(commitPaste, 0); // let the browser insert the clipboard text first
  });
  pasteArea.addEventListener("input", function () {
    if (typeTimer !== null) clearTimeout(typeTimer);
    if (pasteArea.value.trim() === "") return;
    typeTimer = setTimeout(function () { typeTimer = null; commitPaste(); }, PASTE_IDLE_MS);
  });

  // Back to the empty state: no log in state, paste box + placeholder shown,
  // status row hidden. Used by Reset with a snippet loaded (B15).
  function clearToPaste() {
    if (typeTimer !== null) { clearTimeout(typeTimer); typeTimer = null; }
    state.file = null;
    state.lines = null;
    state.linesLower = null;
    state.status = null;
    state.matchIndexes = null; // B19 — no match view in the empty state
    statusRow.textContent = I18N.t(I18N.locale(), "status.noFile"); // B20 — empty-state instruction above the pane
    statusRow.hidden = false;
    syncExportBtn(); // B19 — disable (state.status is now null)
    logView.setLines([]); // empty view — 0px spacer, no rows
    logViewportEl.hidden = true;
    pasteArea.value = "";
    pasteArea.hidden = false;
    searchInput.value = "";
    clearError();
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
  function doReset() {
    // B15 (ui-spec §5) — a loaded pasted snippet resets back to the empty state
    // (paste box + placeholder shown, no log in state). Everything else keeps
    // the B8 behavior below.
    if (state.file && state.file.pasted === true) return clearToPaste();
    // B8 (CHECKLIST 2.4) — the shared reset path for the Reset button and
    // window.SLS.reset (CHECKLIST 5.2, spec/webmcp §3 reset_view): clear the
    // search input and the error slot, show the entire log again from line 1
    // (setLines resets the view and scrolls to top per ui-spec §4), status
    // `loaded` for the same file.
    searchInput.value = "";
    state.matchIndexes = null; // B19 — back to the whole-log view
    logView.setLines(state.lines);
    logView.clearHighlight(); // §4/B16 — reset clears the input, so its preview goes with it
    setStatus("status.loaded", { file: state.file.name, lines: state.lines.length });
    clearError();
  }

  resetBtn.addEventListener("click", function () {
    if (!state.file) {
      // B2 — strict no-op for loaded state; uncommitted paste-box text is
      // discarded so Reset always lands on a clean page.
      if (typeTimer !== null) { clearTimeout(typeTimer); typeTimer = null; }
      pasteArea.value = "";
      return;
    }
    doReset();
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

  function commitLoad(name, text) {
    // CHECKLIST 5.2 — the single success path every load goes through: user
    // uploads (loadFile) and agent-driven sample loads (SLS.loadSample).
    // Split on \r?\n (one trailing empty element dropped when the text ends
    // with a newline), replace all previous state by reassignment, clear the
    // search input (B9 — CHECKLIST 2.3), render the whole file from line 1,
    // unhide #results, status `loaded`, error slot cleared.
    const lines = text.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop(); // text ends with a newline → drop one trailing empty element
    }
    state.lines = lines;
    state.linesLower = lines.map((l) => l.toLowerCase()); // built ONCE (Phase 3 searches over this — query-language §2)
    state.matchIndexes = null;   // B19 — a fresh load shows the whole log, not a match view
    searchInput.value = "";   // B9 — replace clears any previous query
    logView.clearHighlight(); // §4/B16 — the preview belonged to the cleared query
    logView.setLines(lines);  // whole file from line 1, scrolled to top (§4)
    results.hidden = false;   // after setLines → ResizeObserver sees the real size (2.1)
    statusRow.hidden = false; // content is present → status row visible
    pasteArea.value = "";     // empty state is over (or an upload replaced a pasted snippet)
    pasteArea.hidden = true;
    logViewportEl.hidden = false;
    setStatus("status.loaded", { file: name, lines: lines.length });
    clearError();             // next successful action clears the error slot (§2)
  }

  async function loadFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showError("err.fileTooLarge"); // B5 — nothing else is touched
      return;
    }
    setStatus("status.loading", { file: file.name }); // B13 — visible during the read
    try {
      const text = await file.text(); // async read — UI stays responsive (B13)
      state.file = file; // committed only after a successful read (B5)
      commitLoad(file.name, text); // shared success path (CHECKLIST 5.2)
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

  // --- window.SLS (CHECKLIST 5.2 — spec/webmcp §2–§3) ---------------------------------
  // Tiny internal API on window so js/webmcp.js's four tools can drive the app
  // without duplicating UI logic: each method runs the exact same paths as the
  // buttons (performQuery / doReset / commitLoad / state) and returns the
  // JSON-serializable objects spec/webmcp §3 specifies. webmcp.js is the ONLY
  // file in the app that references navigator.modelContext — this section never
  // does (spec/webmcp §1 "keep isolation absolute").
  const SAMPLE_FILES = { // spec/webmcp §4 — the four committed sample logs
    windows: "windows-event.log",
    linux: "linux-syslog.log",
    web: "web-access.log",
    app: "app-json.log",
  };

  const SLS = {
    // get_log_status (§3) — derived from the last rendered status row: a
    // matched/matchedAny/noMatches row means a search ran since the last load/reset;
    // loaded/loading rows mean the whole-log view (nothing else is stored).
    status() {
      if (!state.file) {
        return { has_log: false, file_name: null, total_lines: null, has_searched: false, match_count: null };
      }
      const s = state.status;
      const searched = !!s && (s.key === "status.matched" || s.key === "status.matchedAny" || s.key === "status.noMatches");
      let matchCount = null;
      if (s && (s.key === "status.matched" || s.key === "status.matchedAny")) matchCount = s.params.matches;
      else if (s && s.key === "status.noMatches") matchCount = 0; // noMatches row carries no params.matches
      return { has_log: true, file_name: state.file.name, total_lines: state.lines.length, has_searched: searched, match_count: matchCount };
    },

    // search_logs (§3) — same parser/matcher as the UI (performQuery); the
    // query lands in the search box so the user sees what the agent ran
    // (reset_view clears it again). No file loaded → error object only, no UI
    // side effects; a parse error leaves the previous view untouched (B11) and
    // returns the parser's exact detail string (spec/query-language §3).
    search(query) {
      const q = String(query === null || query === undefined ? "" : query).trim();
      if (!state.file) {
        return { ok: false, error: "No log is loaded. Call load_sample_log first or ask the user to upload a file." };
      }
      if (q === "") {
        // B10 view (whole log again, no error) with this tool's serialization:
        // every line "matches", no previews.
        searchInput.value = "";
        logView.setLines(state.lines);
        state.matchIndexes = null; // B19 — SLS.search("") shows the whole log
        setStatus("status.loaded", { file: state.file.name, lines: state.lines.length });
        clearError();
        return { ok: true, total_lines: state.lines.length, matched_lines: state.lines.length, samples: [] };
      }
      searchInput.value = q; // show the agent's query in the box
      try {
        const result = performQuery(q);
        const indexes = result.indexes;
        const samples = indexes.slice(0, 10).map((i) => ({
          line_number: i + 1, // original 1-based numbers (query-language §2)
          text: state.lines[i].slice(0, 200), // "…≤200 chars…"
        }));
        const response = { ok: true, total_lines: state.lines.length, matched_lines: indexes.length, samples };
        if (result.fallback) {
          // §2 zero-hit AND fallback: say so for the agent (webmcp §3 note field).
          response.note = "No line contained every term of the query, so lines matching any of its positive terms are returned; NOT exclusions still apply.";
        }
        return response;
      } catch (e) {
        if (e && e.name === "QueryParseError") {
          return { ok: false, error: e.detail }; // exact §3 detail string
        }
        throw e; // non-parser failure — the webmcp guard turns it into { ok:false, error }
      }
    },

    // reset_view (§3) — same path as the Reset button (B8); no file loaded →
    // error object only (the UI button stays a strict B2 no-op).
    reset() {
      if (!state.file) return { ok: false, error: "No log is loaded." };
      const wasPasted = state.file.pasted === true;
      const total = state.lines.length;
      doReset();
      // spec/webmcp §3 (2026-09-20): a pasted snippet resets to the empty paste
      // state → no log remains.
      return wasPasted
        ? { ok: true, total_lines: 0, has_log: false }
        : { ok: true, total_lines: total, has_log: true };
    },

    // load_sample_log (§3) — fetches samples/<name> by relative URL and commits
    // it through the exact user-upload success path (commitLoad), so replace
    // semantics (B9) hold for agent-driven loads too. This is what makes the
    // site demo-able end-to-end with zero user files.
    async loadSample(sample) {
      const name = Object.prototype.hasOwnProperty.call(SAMPLE_FILES, sample) ? SAMPLE_FILES[sample] : null;
      if (!name) {
        return { ok: false, error: 'Unknown sample "' + String(sample) + '". Valid samples: windows, linux, web, app.' };
      }
      let text;
      try {
        const res = await fetch("samples/" + name); // relative — same origin as the page
        if (!res.ok) throw new Error("HTTP " + res.status);
        text = await res.text();
      } catch (e) {
        return { ok: false, error: "Could not load samples/" + name + " (" + String((e && e.message) || e) + ")." };
      }
      state.file = { name: name }; // sample descriptor — commitLoad only needs .name
      commitLoad(name, text);
      return { ok: true, file_name: name, total_lines: state.lines.length };
    },
  };

  window.SLS = SLS;

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

  // --- Search core (CHECKLIST 3.4 + 5.2) -------------------------------------------------
  // The single search path: parse → compile ONCE per search → single pass over
  // the pre-lowercased lines → 0-based indexes (spec/query-language §2). A zero-hit
  // AND query may fall back to any-of over its positive terms with NOT exclusions
  // still applied (query-language §2; B17) — performQuery reports that via fallback.
  // LogView shows the matches with ORIGINAL line numbers and scrolls to top
  // (ui-spec §4); status matched/noMatches (B6); a later search updates this
  // same window in place (B7). Called by both the form submit handler
  // (CHECKLIST 3.4) and window.SLS.search (CHECKLIST 5.2 — spec/webmcp §3:
  // "same parser/matcher as the UI"); neither duplicates the other's logic.
  // Throws the parser's QueryParseError on any spec/query-language §3 error;
  // callers decide how to surface it (UI → err.invalidQuery slot, previous
  // view untouched — B11).
  function performQuery(query) {
    const result = QueryParser.searchWithFallback(query, state.linesLower); // throws QueryParseError on any §3 error; strict result first, §2 zero-hit fallback on empty
    const ast = result.ast;
    const indexes = result.indexes;
    state.matchIndexes = indexes; // B19 — the export button downloads exactly this set
    logView.showMatches(indexes);
    // §4/B16 — keep the preview marks in sync with the query that just ran. The WebMCP
    // path (window.SLS.search) sets the input without firing an 'input' event, so the
    // rAF listener alone would leave stale marks from a different typed query.
    logView.setHighlight(QueryParser.positiveAtoms(ast));
    if (indexes.length === 0) {
      setStatus("status.noMatches", { file: state.file.name, total: state.lines.length, query: query });
    } else if (result.fallback) {
      // §2 zero-hit AND fallback (B17): no line contained every term — the shown lines
      // match any positive term with all NOT exclusions still applied; say so.
      setStatus("status.matchedAny", { file: state.file.name, total: state.lines.length, matches: indexes.length, query: query });
    } else {
      setStatus("status.matched", { file: state.file.name, total: state.lines.length, matches: indexes.length, query: query });
    }
    clearError(); // next successful action clears the error slot (ui-spec §2)
    return { indexes: indexes, fallback: result.fallback }; // 0-based + fallback flag — SLS.search maps indexes to line_number/text samples and adds its note on fallback
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
      state.matchIndexes = null; // B19 — B10 shows the whole log, not matches
      logView.setLines(state.lines);
      logView.clearHighlight(); // §4/B16 — back to the whole log; a whitespace query can't carry a preview
      setStatus("status.loaded", { file: state.file.name, lines: state.lines.length });
      clearError();
      return;
    }
    // CHECKLIST 3.4 (B6/B7/B11): performQuery() is the single search path,
    // shared with window.SLS.search (CHECKLIST 5.2).
    try {
      performQuery(query);
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

  // --- Live highlight preview (user request 2026-09-22 — ui-spec §4 / B16) --------------
  // While the user types (no submit), a file/snippet is loaded, and the trimmed query
  // is > 3 characters: parse the partial query and hand its positive atoms to
  // LogView.setHighlight() — visible rows wrap case-insensitive occurrences in
  // <mark class="hl">. The preview is viewport-only (virtualization — it NEVER scans
  // the whole file per keystroke) and never runs the search: no showMatches, no
  // status-row change until Enter (B6/B7 semantics untouched). ≤ 3 chars, no content,
  // or a mid-typing parse error (unterminated quote / dangling operator — normal while
  // typing) → marks cleared, so a stale query's highlights never linger.

  let hlQueued = false;
  function updateHighlightPreview() {
    hlQueued = false;
    if (!state.file) { logView.clearHighlight(); return; }
    const q = searchInput.value.trim();
    if (q.length <= 3) { logView.clearHighlight(); return; }
    try {
      // positiveAtoms returns [] for fully negative queries (e.g. `not "x"`) —
      // setHighlight([]) clears: a query that only excludes highlights nothing.
      logView.setHighlight(QueryParser.positiveAtoms(QueryParser.parseQuery(q)));
    } catch (e) {
      if (e && e.name === "QueryParseError") logView.clearHighlight();
      else throw e; // non-parser failure — never swallow it silently
    }
  }
  searchInput.addEventListener("input", function () {
    if (hlQueued) return;
    hlQueued = true;
    requestAnimationFrame(updateHighlightPreview); // coalesce rapid keystrokes to one render each frame
  });

  // --- Export Snippet (user request 2026-09-25 — ui-spec §4 / B19) -------------------
  // Downloads the CURRENT match view as a plain-text file: the matched lines exactly
  // as they appear in the file — no line numbers, no header — joined with newlines
  // and terminated by a final newline. Built entirely from in-memory state
  // (state.lines + state.matchIndexes) → no server involved; nothing leaves the
  // device. Download name = <source-base>-matches.txt (last extension stripped;
  // characters unsafe in file names replaced by "_"; a pasted snippet exports as
  // snippet-matches.txt). UTF-8 text/plain via Blob + object URL + a[download];
  // the object URL is revoked after the click.
  function exportFilename(name) {
    const base = String(name).replace(/\.[^./\\]+$/, ""); // strip the last extension
    return (base.replace(/[\\/:*?"<>|]/g, "_") || "log") + "-matches.txt";
  }

  function exportSnippet() {
    const indexes = state.matchIndexes;
    if (!state.file || !indexes || indexes.length === 0) return; // defensive — the button is hidden outside a match view
    const parts = new Array(indexes.length);
    for (let i = 0; i < indexes.length; i++) parts[i] = state.lines[indexes[i]];
    const blob = new Blob([parts.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename(state.file.name);
    document.body.appendChild(a); // Firefox requires the anchor in the DOM
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  exportBtn.addEventListener("click", exportSnippet);

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
