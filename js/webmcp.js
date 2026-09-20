// SimpleLogSearch — js/webmcp.js (CHECKLIST 5.2)
// W3C WebMCP tool registration — spec/webmcp §1–§3. This is the ONLY file in
// the app that may reference the WebMCP modelContext API ("keep isolation
// absolute"): document.modelContext, navigator.modelContext fallback (see §2);
// loaded only on index.html and always AFTER js/app.js, so window.SLS exists
// when this runs. Feature-detected per §2: on unsupported browsers (Firefox/
// Safari today) the IIFE returns immediately — silent no-op, zero console noise
// (§1 support table; §5 step 6 negative test).
//
// The four tools below are thin delegations to window.SLS — the single internal
// API app.js exposes (CHECKLIST 5.2). No tool duplicates UI logic: SLS.search/
// reset/loadSample/status run the exact same parser/matcher/view paths as the
// buttons and return the JSON-serializable objects §3 specifies. Rules per §2:
// ≤10 tools (we register 4), snake_case names, plain-English agent-facing
// descriptions that state preconditions, every execute returns an object and
// never throws (guard below).

(function () {
  "use strict";

  // document first: on builds that deprecate the navigator alias, touching
  // navigator.modelContext logs a console warning (spec §1 "no console noise").
  const doc = typeof document !== "undefined" ? document : undefined;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const mc = (doc && doc.modelContext) || (nav && nav.modelContext);
  if (!mc || typeof mc.registerTool !== "function") return; // no-op on unsupported

  const guard = (fn) => async (input) => {
    try { return fn(input); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  };

  // registerTool differs across builds (spec §2 note): canonical 2-arg (name, def)
  // first; on sync throw / rejecting Promise fall back to single-arg { name, …def }.
  // Every failure mode swallowed — silent no-op, zero console noise.
  const register = (name, def) => {
    const alt = () => {
      try { return Promise.resolve(mc.registerTool({ name, ...def })).catch(() => {}); }
      catch (e) { return Promise.resolve(); }
    };
    try {
      const r = mc.registerTool(name, def);
      if (r && typeof r.then === "function") return r.catch(alt);
    } catch (e) { return alt(); }
  };

  register("get_log_status", {
    description: "Report the state of the log loaded in SimpleLogSearch: whether " +
      "a log is loaded, its file name and total line count, and — if a search " +
      "has run since the last load or reset — how many lines it matched. Takes " +
      "no input and changes nothing; call it first to see what is available.",
    inputSchema: { type: "object", properties: {} },
    execute: guard(() => SLS.status()),
  });

  register("search_logs", {
    description: "Search the currently loaded log file with a boolean query " +
      '(quoted phrases, AND/OR/NOT, parentheses). Returns match count and ' +
      "up to 10 matching line previews with original line numbers. " +
      'Example query: "MID 123456" and "MID 123654" not "192.168.1.1"',
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Boolean log query" } },
      required: ["query"],
    },
    execute: guard((input) => SLS.search(input.query)),
  });

  register("reset_view", {
    description: "Restore the full log view and clear the search box — exactly " +
      "what the Reset button does. Requires a log to be loaded first (call " +
      "load_sample_log, or ask the user to upload a file); returns the total " +
      "line count.",
    inputSchema: { type: "object", properties: {} },
    execute: guard(() => SLS.reset()),
  });

  register("load_sample_log", {
    description: "Load one of the four built-in sample logs — \"windows\" " +
      "(Windows-event style), \"linux\" (syslog), \"web\" (Apache combined " +
      "access log) or \"app\" (one JSON object per line) — exactly as a user " +
      "upload would: any loaded file is replaced, the search box is cleared and " +
      "the full log is shown. Call this first to make the app usable end-to-end " +
      "with zero user files.",
    inputSchema: {
      type: "object",
      properties: {
        sample: {
          type: "string",
          enum: ["windows", "linux", "web", "app"],
          description: "Which built-in sample log to load",
        },
      },
      required: ["sample"],
    },
    execute: guard((input) => SLS.loadSample(input.sample)),
  });
})();