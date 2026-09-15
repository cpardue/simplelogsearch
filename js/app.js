// SimpleLogSearch — js/app.js
// App-shell behaviors (CHECKLIST 1.4): language change → apply + persist;
// Reset with no file loaded = strict no-op (B2); Upload click opens the
// picker, cancel = nothing, selected File stored in state (handling lands in
// Phase 2); search submit with no file → flash Upload + err.noFile (B1);
// Esc clears the error slot only (B12); `/` focuses the search input.
//
// Classic deferred script (no framework, no build): loaded after js/i18n.js in
// index.html, so window.I18N exists and the DOM is already parsed. Error-slot
// rules per spec/ui-spec §2 (auto-dismiss after 6 s; Esc clears; the next
// successful action clears — Phases 2–3 call clearError() on success); flash
// per §3; keyboard per §6. Upload handling (B3/B5/B9/B13), result rendering
// and query execution land in Phases 2–3 at the marked spots.

(function () {
  "use strict";

  const I18N = window.I18N;

  // --- DOM handles ----------------------------------------------------------
  const langSelect = document.getElementById("langSelect");
  const errorSlot = document.getElementById("errorSlot");
  const searchForm = document.querySelector("form.search-bar");
  const searchInput = document.querySelector("input.search-input");
  const resetBtn = document.getElementById("resetBtn");
  const uploadBtn = document.getElementById("uploadBtn");
  const fileInput = document.getElementById("fileInput");

  // --- State ------------------------------------------------------------------
  // Phase 1 keeps only the selected File (CHECKLIST 1.4). lines/linesLower,
  // status and match state land in Phases 2–3.
  const state = { file: null };

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
  });
  langSelect.value = I18N.locale();

  // --- Reset ---------------------------------------------------------------------------
  resetBtn.addEventListener("click", function () {
    if (!state.file) return; // B2 — strict no-op: no error, no state change
    // CHECKLIST 2.4 (Phase 2): clear input + error, show all lines, status loaded.
  });

  // --- Upload picker ---------------------------------------------------------------------
  uploadBtn.addEventListener("click", function () {
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    const picked = fileInput.files && fileInput.files[0];
    if (picked) state.file = picked; // B4 — cancelled picker → no files → nothing changes
    fileInput.value = ""; // allow re-selecting the same file later (B9, Phase 2)
  });

  // --- Search submit ------------------------------------------------------------------------
  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!state.file) {
      flashUpload();
      showError("err.noFile"); // "✕ Upload Log File before searching"
      // B1: input kept, #results stays hidden — neither is touched here.
      return;
    }
    // CHECKLIST 2.2–3.x (Phases 2–3): read the file + run the query (B6–B11).
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

