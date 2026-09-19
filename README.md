# SimpleLogSearch — Planning Docs

Free, client-side log-file search tool with a Google-style dark UI, boolean
(AND/OR/NOT) phrase queries, 21-language UI, WebMCP agent tools, and a
Google-indexable, AdSense-ready content set. Hosted on GitHub Pages at
`https://simplelogsearch.com/` (repo: `cpardue/simplelogsearch`).

This folder is the **source of truth for planning** and will be mirrored 1:1 to
the repo root (see CHECKLIST item 0.3), so any future LLM session can read the
plan + checklist from GitHub even without the local workspace.

## Document map

| Doc | Purpose |
|---|---|
| `SESSION_PROMPT.md` | **Paste this at the start of every build session** — boots an LLM straight onto the next checklist item with zero workspace exploration. |
| `CHECKLIST.md` | **Execute this.** Overarching multi-session checklist; an LLM works top-to-bottom, one unchecked item at a time, verifying each item's gate before checking it off. |
| `PLAN.md` | End-to-end implementation plan: constraints, stack, architecture, milestones, risks. Reference for all phases. |
| `spec/ui-spec.md` | Pixel/behavior spec: Google-dark colors, dimensions, state machine (every upload/search/reset case), a11y, RTL. |
| `spec/query-language.md` | Query grammar (EBNF), matching semantics, edge cases, canonical examples, full test-vector table. |
| `spec/i18n.md` | 21-locale list, complete EN string catalog (source of truth), translation rules, dir/RTL mapping, persistence. |
| `spec/webmcp.md` | WebMCP tool definitions (schemas + returns), registration code shape, browser support, origin-trial steps, test protocol. |
| `spec/seo-adsense.md` | Anti-thin-content strategy: page inventory with word-count targets + content outlines, meta/JSON-LD per page, sitemap/robots/GSC, AdSense process incl. domain-strategy decision. |

## Locked decisions (user, 2026-09-14)

1. Hosting: new public repo `cpardue/simplelogsearch` → Pages project site at
   `/simplelogsearch/`. Custom domain (e.g. simplelogsearch.com) is a later
   step — but it gates the AdSense application (see CHECKLIST 7.4).
2. i18n: English + 20 most-prominent non-English IT languages, **core UI
   strings only**. All guide/content pages stay English. Logo always English.
3. Stack: plain static HTML/CSS/vanilla JS. No framework, no build step, no
   npm deps (cehstudy style). Query parser is node-testable via a UMD export
   guard so `node test/query-tests.mjs` is the automated gate.

## Operating notes (this environment)

- No git CLI installed here → all GitHub ops go through the GitHub MCP tools
  and/or Contents-API node scripts using the PAT from cline MCP settings
  (proven pattern, see `history/cehstudy.md`).
- Push protocol: local folder is the working copy; each checklist phase ends
  with "push + verify live" items. Rollback = GitHub commit history (shas
  recorded in the CHECKLIST Session Log).
