# Session Bootstrap Prompt

Copy everything inside the block below and paste it as the first message of
each new build session. It is written so the LLM never needs to explore the
workspace or re-derive the plan — all startup context is in the prompt.

---

```
SimpleLogSearch build session — bootstrap. Follow this exactly.

PROJECT: SimpleLogSearch — free in-browser log search app (AND/OR/NOT), static
HTML/CSS/vanilla JS, GitHub Pages at https://cpardue.github.io/simplelogsearch/,
repo cpardue/simplelogsearch. All planning lives in the local folder
`simplelogsearch/` under the workspace root
(c:\Users\cpard\OneDrive\Documents\vscode\simplelogsearch), which maps 1:1 to
the repo root.

CONTEXT DISCIPLINE — hard rules:
- Do NOT list/explore the workspace, do NOT read files outside simplelogsearch/,
  do NOT re-plan, do NOT create new docs.
- Read, in order and only as needed:
  1. simplelogsearch/CHECKLIST.md — the ONLY file you execute from / check off.
  2. The specific section(s) of simplelogsearch/spec/*.md that the current item
     references (use line-bounded reads).
  3. simplelogsearch/PLAN.md — only if the item is still ambiguous after 1–2.
- If CHECKLIST.md is missing locally, fetch
  https://raw.githubusercontent.com/cpardue/simplelogsearch/main/CHECKLIST.md
  and recreate the file before proceeding.

TASK: Find the FIRST unchecked `- [ ]` item in document order. Execute exactly
that one item:
- Follow its sub-steps and spec references literally. Spec is source of truth;
  if code and spec disagree, fix the spec first (one-line rationale) then code.
- If it looks partially done already, treat it as not-done: finish it and run
  its Verify gate — do not restart from scratch unless Verify fails.
- Run the item's Verify gate for real (command output, browser check, or live-URL
  probe). No check-off without a passing verify; if it fails, fix within this
  item.
- On success: mark the box done and append ONE line (newest first) to the
  Session Log section of CHECKLIST.md:
  [YYYY-MM-DD HH:MM] item X.Y done — <verify evidence> — <commit sha if pushed>
- If the item is `[MANUAL user]`: prepare everything, present the exact steps
  to the user, then STOP.
- If the item is `[USER DECISION]`: present options + recommendation, STOP for
  the user's choice.

STOP after that single item completes (or at a manual/decision block). Report:
item id, files changed + commit shas, verify evidence, and the next unchecked
item id. Do not begin the next item in this session.

ENVIRONMENT FACTS — use, do not re-discover:
- Windows PowerShell; no git CLI. Push to GitHub via GitHub MCP tools or a node
  Contents-API script using the PAT from cline MCP settings (fine-grained
  github_pat_ accepted). GitHub MCP tools must be available — if not, STOP and say so.
- node is available. Parser test gate: `node simplelogsearch/test/query-tests.mjs`.
- Pages deploys take 1–5 min after push: probe the live URL with a few retries
  before declaring failure.
- Keep the diff scoped to this item: no refactors, no drive-by fixes, no scope
  creep.
```
