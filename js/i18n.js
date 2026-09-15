// SimpleLogSearch — js/i18n.js
// 21-locale string catalogs + apply/persist/dir (spec/i18n.md §1–§4).
//
// Plain classic script (no framework, no modules), loaded with `defer` in
// index.html: the DOM is already parsed and the pre-paint head script has set
// <html lang|dir> from localStorage["sls-lang"]. This file performs the full
// boot-time string application; js/app.js re-applies on every language change.
//
// Contract (CHECKLIST 1.3):
//   - I18N.apply(locale) — text/aria-label/placeholder for every [data-i18n*]
//     element, <html lang|dir> (ar/ur → rtl, all others ltr), and persistence
//     to localStorage["sls-lang"].
//   - Default locale "en"; unknown/stale stored values normalize to "en".
//   - The 20 non-EN dictionaries are stubs for now: every key resolves through
//     the EN fallback (real translations land in Phase 4, CHECKLIST 4.1).

(function () {
  "use strict";

  // spec/i18n §1 — known locale codes in dropdown order (en first, then by
  // IT-prominence). The <select> always shows endonyms, never translated
  // (Google's convention), so options carry no data-i18n attributes.
  const LOCALES = [
    "en", "zh-CN", "es-ES", "hi-IN", "ar", "bn", "pt-BR", "ru", "ja", "de",
    "fr", "ko", "tr", "vi", "id", "th", "pl", "ur", "nl", "it", "uk",
  ];

  // §1 — ar/ur → rtl; all others ltr.
  const RTL = { ar: true, ur: true };

  // spec/i18n §2 — EN catalog (source of truth, exact values; 23 keys).
  const EN = {
    "lang.label": "Language",
    "search.placeholder": "Search your log file…",
    "search.buttonAria": "Run search",
    "btn.reset": "Reset",
    "btn.upload": "Upload",
    "err.noFile": "✕ Upload Log File before searching",
    "err.fileTooLarge": "✕ File too large (max 50 MB). Please choose a smaller file.",
    "err.readFile": "✕ Could not read the selected file. Please try again.",
    "err.invalidQuery": "✕ Invalid query: {detail} — see the Query Syntax guide.",
    "status.noFile": "No log loaded. Use Upload to open a log file.",
    "status.loading": "Reading {file}…",
    "status.loaded": "{file} — {lines} lines",
    "status.matched": "{file} — {total} lines • {matches} matches for “{query}”",
    "status.noMatches": "{file} — {total} lines • 0 matches for “{query}”",
    "nav.home": "Home",
    "nav.syntax": "Query Syntax",
    "nav.howto": "How-To Guide",
    "nav.faq": "FAQ",
    "nav.about": "About",
    "nav.privacy": "Privacy Policy",
    "a11y.skipToResults": "Skip to results",
    "a11y.logView": "Log content",
    "footer.note": "SimpleLogSearch — free, client-side log search. Files are processed in your browser and never uploaded.",
  };

  // Stub dictionaries for the other 20 locales: empty for now, every key
  // resolves through the EN fallback in lookup(). Phase 4 (CHECKLIST 4.1)
  // fills these under the §3 translation-quality rules.
  const CATALOGS = { en: EN };
  for (const code of LOCALES) {
    if (code !== "en") CATALOGS[code] = {};
  }

  let current = "en";

  function isKnown(locale) {
    return LOCALES.indexOf(locale) !== -1;
  }

  function normalize(locale) {
    return isKnown(locale) ? locale : "en"; // unknown/stale value → en (§4)
  }

  function dirFor(locale) {
    return RTL[locale] ? "rtl" : "ltr";
  }

  function lookup(locale, key) {
    const cat = CATALOGS[locale];
    if (cat && Object.prototype.hasOwnProperty.call(cat, key)) return cat[key];
    if (Object.prototype.hasOwnProperty.call(EN, key)) return EN[key]; // EN fallback
    return "";
  }

  // spec/i18n §2 interpolation: numbers via Number.toLocaleString(locale);
  // {file} = filename as-is; {query} truncated to 60 chars + ellipsis if
  // longer; {detail} = English parser error detail, never translated.
  function format(template, locale, params) {
    return String(template).replace(/\{(\w+)\}/g, function (_, name) {
      let value =
        params && Object.prototype.hasOwnProperty.call(params, name)
          ? params[name]
          : "";
      if (typeof value === "number") value = value.toLocaleString(locale);
      else value = String(value);
      if (name === "query" && value.length > 60) value = value.slice(0, 60) + "…";
      return value;
    });
  }

  // t(locale, key, params?) → translated string with {slot}s filled.
  function t(locale, key, params) {
    const loc = normalize(locale);
    return format(lookup(loc, key), loc, params);
  }

  function persist(locale) {
    try { localStorage.setItem("sls-lang", locale); } catch (e) { /* storage unavailable */ }
  }

  function readStored() {
    try { return localStorage.getItem("sls-lang"); } catch (e) { return null; }
  }

  // spec/i18n §4 — apply: every [data-i18n*] element, <html lang|dir>, persist.
  function apply(locale) {
    current = normalize(locale);
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("lang", current);
      document.documentElement.setAttribute("dir", dirFor(current));
      const nodes = document.querySelectorAll("[data-i18n],[data-i18n-aria],[data-i18n-placeholder]"); // "[data-i18n*]" is not a valid CSS selector (CHECKLIST 1.6, protocol 8)
      for (const el of nodes) {
        const key = el.getAttribute("data-i18n");
        if (key !== null) el.textContent = lookup(current, key);
        const ariaKey = el.getAttribute("data-i18n-aria");
        if (ariaKey !== null) el.setAttribute("aria-label", lookup(current, ariaKey));
        const phKey = el.getAttribute("data-i18n-placeholder");
        if (phKey !== null) el.setAttribute("placeholder", lookup(current, phKey));
      }
    }
    persist(current);
    return current;
  }

  // Boot-time application: this deferred script runs after DOM parse, so
  // strings + lang/dir land before js/app.js init. No stored value or a stale
  // one → default "en" (persisted).
  apply(readStored());

  const I18N = {
    LOCALES: LOCALES,
    RTL: RTL,
    EN: EN,
    CATALOGS: CATALOGS,
    apply: apply,
    t: t,
    lookup: lookup,
    normalize: normalize,
    dirFor: dirFor,
    locale: function () { return current; },
  };

  if (typeof window !== "undefined") window.I18N = I18N;
  if (typeof module !== "undefined" && module.exports) module.exports = I18N; // node testability (same UMD-guard pattern as query-parser)
})();

