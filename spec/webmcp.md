# Spec — WebMCP (`js/webmcp.js`)

Goal: AI agents (browser-integrated, ChatGPT Desktop, Brave Leo, iframes) can
drive the app directly via W3C WebMCP tools instead of simulating clicks.
Loaded **only on index.html**; feature-detected; silently no-ops elsewhere.
This file is the ONLY place that may reference the WebMCP modelContext API
(`document.modelContext`, with `navigator.modelContext` as fallback) — spec is
still evolving, keep isolation absolute.

## 1. Browser/agent support (verified 2026-09)

| Environment | Status |
|---|---|
| Chrome 149+ | Origin Trial (free token; CHECKLIST 5.5). Local dev: `about:flags#enable-webmcp-testing` |
| Edge 150+ | Origin Trial (separate token) |
| ChatGPT Desktop | Supported natively |
| Brave (Leo AI) | Experimental |
| Firefox / Safari | Not yet — silent no-op, no console noise |

Requirements satisfied by our static page: origin-isolated document (we never
touch `document.domain`), Permissions Policy `tools` defaults to `self`
(top-level OK — we are top-level).

## 2. Registration shape (imperative API)

```js
(function () {
  // document first: on builds that deprecate the navigator alias, touching
  // navigator.modelContext logs a console warning (violates §1 "no console noise").
  const doc = typeof document !== "undefined" ? document : undefined;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const mc = (doc && doc.modelContext) || (nav && nav.modelContext);
  if (!mc || typeof mc.registerTool !== "function") return;   // no-op on unsupported
  const guard = (fn) => async (input) => {
    try { return fn(input); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  };
  // registerTool differs across builds (see note below the snippet): try the
  // canonical 2-arg call; on sync throw / rejecting Promise fall back to the
  // single-arg { name, …def } form. Every failure mode is swallowed — silent
  // no-op, zero console noise.
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
  register("search_logs", {
    description: "Search the currently loaded log file with a boolean query " +
      '(quoted phrases, AND/OR/NOT, parentheses). Returns match count and ' +
      "up to 10 matching line previews with original line numbers. " +
      "Example query: \"MID 123456\" and \"MID 123654\" not \"192.168.1.1\"",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Boolean log query" } },
      required: ["query"]
    },
    execute: guard((input) => SLS.search(input.query))
  });
  // … same pattern for the other 3 tools (below)
})();
```

*(2026-09-17 amended per protocol 8 after CHECKLIST 5.3 live probe on current Chromium
(ms-playwright chromium-1234): modelContext lives on `document` and the `navigator`
alias logs a deprecation warning; that build's `registerTool` rejects the canonical
2-arg call with "not of type 'ModelContextTool'" while accepting single-arg
`{ name, …def }`, which returns a Promise. Document-first + dual-signature keeps the
canonical shape for spec-conformant builds and zero console noise everywhere.)*

Rules: ≤ 10 tools/page (we use 4); names `snake_case`; descriptions written in
plain English **for the agent** (state preconditions!); every `execute` returns
a JSON-serializable object, never throws (guard above); tools must work even if
the user has not interacted with the page at all.

## 3. Tools

### `get_log_status` — input: none (`{}`)
Returns: `{ has_log: boolean, file_name: string|null, total_lines: number|null,
has_searched: boolean, match_count: number|null }`

### `search_logs` — input: `{ query: string }` (required)
Runs the same parser/matcher as the UI. Returns:
- success: `{ ok: true, total_lines: n, matched_lines: m, samples: [ { line_number: 123, text: "…≤200 chars…" } × ≤10 ] }`
- success with the zero-hit AND fallback active (query-language §2): same shape plus `note: string` — explains that lines matching any positive term were returned (NOT exclusions still applied)
- no file loaded: `{ ok: false, error: "No log is loaded. Call load_sample_log first or ask the user to upload a file." }`
- bad query: `{ ok: false, error: "<parser detail from spec/query-language.md §3>" }`

### `reset_view` — input: none
Restores the full log view and clears the search box (same as the Reset
button). Returns `{ ok: true, total_lines: n, has_log: boolean }`. If no file
is loaded → `{ ok: false, error: "No log is loaded." }` A pasted snippet (the
paste box's committed text, named `snippet`) counts as a loaded file; resetting
it returns the page to the empty paste state and the tool returns
`{ ok: true, total_lines: 0, has_log: false }`.

### `load_sample_log` — input: `{ sample: "windows" | "linux" | "web" | "app" }` (required enum)
Fetches `samples/<sample>-*.log` (relative), loads it exactly as a user upload
would (replaces any loaded file, clears query, shows full log). Returns
`{ ok: true, file_name: string, total_lines: n }`. This tool is what makes the
site demo-able end-to-end by an agent with zero user files — and what our E2E
tests script against.

## 4. Sample logs (created in CHECKLIST 5.1; content requirements)

| file | ~lines | must contain |
|---|---|---|
| `samples/windows-event.log` | 400 | ≥3 lines with `MID 123456`, ≥3 with `MID 123654`, ≥2 lines containing **both** plus `192.168.1.1` (so the canonical NOT query visibly filters), mixed Severity/Event IDs |
| `samples/linux-syslog.log` | 400 | syslog format, IPs, auth failures |
| `samples/web-access.log` | 500 | Apache combined format, statuses 200/301/404/500 |
| `samples/app-json.log` | 300 | one JSON object per line, error/warn levels, `trace_id` fields |

All < 50 KB, deterministic (seeded generator script kept in repo under
`test/gen-samples.mjs`, re-runnable; committed outputs are the source of truth).

## 5. Test protocol (CHECKLIST 5.4/5.6)

1. Chrome with the **Model Context Tool Inspector** extension installed.
2. Local: `about:flags#enable-webmcp-testing` on, serve folder over http(s)
   (e.g. `npx -y http-server .` — WebMCP requires a secure context/localhost).
3. Open `index.html` → inspector must list exactly 4 tools with our schemas.
4. Scripted flow in inspector console:
   `load_sample_log({sample:"windows"})` → expect ok + total_lines
   → `search_logs({query:'"MID 123456" and "MID 123654" not "192.168.1.1"'})`
   → record matched_lines (must equal the sample's designed count)
   → `reset_view()` → `get_log_status()` → expect has_searched=false, match_count=null.
5. Natural-language test (agent side): ask the browser agent / ChatGPT Desktop:
   *"Use this page's tools to load the windows sample log, then find lines that
   contain MID 123456 and MID 123654 but not 192.168.1.1, and tell me the count."*
   Agent must invoke tools (not click the UI) and return the correct count.
6. Negative: Firefox open → zero console errors/warnings from webmcp.js.

## 6. Origin trial (user action — CHECKLIST 5.5)

Apply at developer.chrome.com origin trials for **WebMCP**; add origins
`https://simplelogsearch.com` (serving origin) + `https://cpardue.github.io`
(alias), and `http://localhost` (+`https://localhost`);
insert returned tokens as `<meta http-equiv="Origin-Trial" content="…">` in
index.html `<head>` (one meta per token); commit; re-run step 3–5 against the
**live** URL. Edge trial: same, separate token, add to index too. Keep tokens
in-repo (they are public by design).