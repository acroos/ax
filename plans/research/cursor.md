# Research: Cursor Session Data Availability

Research date: April 2026. Sources linked inline; all docs/repos/forum threads verified at time of research.

## TL;DR

Cursor has **three parseable data surfaces** and one opaque one. Contrary to a pre-2025 assumption that Cursor data is locked away, Cursor shipped a CLI (`agent`, August 2025) with JSON/stream-JSON output and a hooks system (`.cursor/hooks.json`) explicitly modeled on Claude Code — docs even say *"Cursor supports loading hooks from third-party tools like Claude Code."*

The remaining hard problem is **token counts and dollar cost**, which are not exposed locally anywhere. Available only through the Cursor Enterprise Admin API.

## Surface 1 — Cursor CLI (`agent`, formerly `cursor-agent`)

**Shipped:** August 2025 ([cursor.com/blog/cli](https://cursor.com/blog/cli)).

**Install:**
- macOS/Linux/WSL: `curl https://cursor.com/install -fsS | bash`
- Windows: `irm 'https://cursor.com/install?win32=true' | iex`

Docs: [cursor.com/docs/cli/overview](https://cursor.com/docs/cli/overview)

**Session commands:**
- `agent ls` — list previous conversations
- `agent resume` / `agent --continue` — resume most recent
- `agent --resume=<chat-id>` — resume by ID

**Config files** ([reference/configuration](https://cursor.com/docs/cli/reference/configuration)):
- Global: `~/.cursor/cli-config.json` (override via `CURSOR_CONFIG_DIR` or on Linux `XDG_CONFIG_HOME`)
- Project: `<project>/.cursor/cli.json`

**Headless output** ([output-format reference](https://cursor.com/docs/cli/reference/output-format), [headless docs](https://cursor.com/docs/cli/headless)):

`agent -p --output-format json` emits a single final object:
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 1234,
  "duration_api_ms": 1234,
  "result": "<full assistant text>",
  "session_id": "<uuid>",
  "request_id": "<optional>"
}
```

`agent -p --output-format stream-json` emits newline-delimited events: system init (model, cwd, API key source), user message, assistant messages, tool call started/completed with args + results, final aggregated result. Supports `--stream-partial-output` for incremental deltas.

**What's missing from CLI output:** Token counts and dollar cost.

**Local session storage for the CLI:** Implied by `agent ls` and `--resume`, but on-disk location is not officially documented. Likely under `~/.cursor/`. Gap to verify empirically.

**Verdict:** Parseable (officially).

## Surface 2 — Cursor hooks (`.cursor/hooks.json`)

The officially blessed integration surface. Docs: [cursor.com/docs/hooks](https://cursor.com/docs/hooks).

**Hook events:**

Agent lifecycle:
- `sessionStart`, `sessionEnd`
- `preToolUse`, `postToolUse`, `postToolUseFailure`
- `subagentStart`, `subagentStop`
- `beforeShellExecution`, `afterShellExecution`
- `beforeMCPExecution`, `afterMCPExecution`
- `beforeReadFile`, `afterFileEdit`
- `beforeSubmitPrompt`, `preCompact`, `stop`
- `afterAgentResponse`, `afterAgentThought`

Tab completions:
- `beforeTabFileRead`, `afterTabFileEdit`

**Universal payload fields** (every hook):
- `conversation_id`, `generation_id`, `model`
- `hook_event_name`, `cursor_version`
- `workspace_roots`, `user_email`
- `transcript_path`

**`transcript_path` is a real file.** Also available via `CURSOR_TRANSCRIPT_PATH` env var. JSONL format, containing user messages, assistant text, tool call inputs (name + args). **Deliberately excludes tool outputs** (can be very large). Sources: [egghead "Logging and Debugging Cursor Hooks"](https://egghead.io/logging-and-debugging-cursor-hooks~j0yh2), [Cursor forum: Accessing the Full Agent Transcript](https://forum.cursor.com/t/accessing-the-full-agent-transcript-in-cursor/157311).

**Event-specific payload examples** (from docs):
- `sessionStart`: `session_id`, `is_background_agent`, `composer_mode`
- `afterShellExecution`: `command`, `output`, `duration`, `sandbox`
- `preCompact`: `context_usage_percent`, `context_tokens`, `context_window_size`, `message_count` — the one place context-token counts appear

**Config file locations:**
- Project: `<project>/.cursor/hooks.json`
- User: `~/.cursor/hooks.json`
- Enterprise: OS-specific system-wide paths
- Team: cloud-distributed (Enterprise only)

**Critical CLI/IDE asymmetry (as of January 2026):**

Sources: [forum: Cursor CLI hooks](https://forum.cursor.com/t/cursor-cli-hooks/148511), [forum: how do hooks work in CLI](https://forum.cursor.com/t/how-do-hooks-work-in-cursor-cli/150201).

Working in CLI:
- `beforeShellExecution`, `afterShellExecution`
- `beforeMCPExecution`, `afterMCPExecution`
- `afterFileEdit`

NOT working in CLI (IDE only):
- `stop`, `beforeSubmitPrompt`, `afterAgentResponse`, `afterAgentThought`
- `beforeReadFile`
- `sessionEnd`

The [Jan 16, 2026 CLI changelog](https://cursor.com/changelog/cli-jan-16-2026) explicitly adds *"Hooks for session start/end, prompt, and stop for customizing agent lifecycle events"* — gap may be closing. Forum reports disagree with the changelog. **Verify at install time.**

**Token cost in hooks:** Not available in any hook payload. The [waynesutton/cursor-cli-sync-plugin](https://github.com/waynesutton/cursor-cli-sync-plugin) README documents this exactly:

> token usage and cost information are not included in any hook payload. This is a platform limitation, not a plugin limitation. Other sync plugins (Codex, Claude Code) can access this data because they read complete local session files, which Cursor doesn't expose.

**Verdict:** Parseable (officially) for session data; not for tokens/cost.

## Surface 3 — IDE SQLite database

**Storage locations** (confirmed by multiple community sources):
- macOS: `~/Library/Application Support/Cursor/User/`
- Linux: `~/.config/Cursor/User/`
- Windows: `%APPDATA%\Cursor\User\`

Two subdirectories:
- `globalStorage/state.vscdb` — app-wide state; primary location for Composer/Agent conversation bodies under the `cursorDiskKV` table
- `workspaceStorage/<hash>/state.vscdb` — per-workspace chat lists, session metadata, legacy `aichat` data, under the `ItemTable` table

**Schema** (reverse-engineered):
- SQLite with generic key-value schema (`ItemTable(key TEXT PRIMARY KEY, value TEXT)` with JSON blobs)
- Key patterns: `composerData:<composerId>`, `bubbleId:<composerId>:<bubbleId>`, `workbench.panel.aichat.view.aichat.chatdata` (legacy), `workbench.backgroundComposer.persistentData`
- Messages contain role, text, timestamps, tool calls, diffs, and optional reasoning blocks

Sources: [dasarpai Cursor architecture writeup](https://dasarpai.com/dsblog/cursor-chat-architecture-data-flow-storage/); [0xSero/ai-data-extraction README](https://github.com/0xSero/ai-data-extraction) (supports Cursor v0.43–v2.0+).

**Community extraction tools:**
- [saharmor/cursor-view](https://github.com/saharmor/cursor-view) — browse/search/export, JSON or HTML
- [somogyijanos/cursor-chat-export](https://github.com/somogyijanos/cursor-chat-export) — CLI, Markdown export, tabs-per-chat
- [S2thend/cursor-history](https://github.com/S2thend/cursor-history) — Node.js lib + CLI, sessions with timestamps
- [haneke86/cursor-history-extractor](https://github.com/haneke86/cursor-history-extractor) — JSON for LLM analysis
- [Ishkei/cursor-chat-recovery](https://github.com/Ishkei/cursor-chat-recovery), [markwroberts0/cursor-chat-recovery](https://github.com/markwroberts0/cursor-chat-recovery) — recovery-focused
- [jbdamask/cursor-db-mcp](https://github.com/jbdamask/cursor-db-mcp) — MCP server for querying Cursor DB
- [ibrahim317/cursor-chat-transfer](https://github.com/ibrahim317/cursor-chat-transfer) — cross-device migration
- [0xSero/ai-data-extraction](https://github.com/0xSero/ai-data-extraction) — **closest prior art to AX**: multi-tool extractor handling Cursor + Claude Code + Codex + Windsurf + Continue + Gemini CLI + OpenCode + Trae with documented per-tool paths and output schema
- [Manojbhat09 gist](https://gist.github.com/Manojbhat09/a71ee0774d166d9e02fb49bb6d95b48d) — minimal Python scanner

**Caveats:**
- Cursor has migrated schema formats multiple times (legacy `aichat` → `composer` → `cursorDiskKV`). Any parser has to handle multiple versions.
- Forum threads document chat-history loss/corruption during upgrades ([2.2.9 data loss](https://forum.cursor.com/t/urgent-lost-all-chat-history-2-2-9/145834/38), [deleted global state.vscdb](https://forum.cursor.com/t/deleting-global-state-vscdb-causes-infinite-loading-chat-in-projects-history-not-recoverable-without-corrupted-backup/153220)). Not a stable API.

**Verdict:** Parseable with effort, unofficially. Works as a fallback.

## Surface 4 — Cloud Agents (async PR agents)

Cloud agents run on Cursor's infrastructure, clone the repo, open a PR. No meaningful local trace, but a documented API exists.

**[Cloud Agents API endpoints](https://cursor.com/docs/cloud-agent/api/endpoints):**
- `GET /v0/agents` — list
- `GET /v0/agents/{id}` — status
- `GET /v0/agents/{id}/conversation` — transcript
- `GET /v0/agents/{id}/artifacts` — generated files
- `POST /v0/agents`, `POST /v0/agents/{id}/followup`, `POST /v0/agents/{id}/stop`
- `GET /v0/me`, `/v0/models`, `/v0/repositories`

Auth: Basic, API key from Cursor Dashboard.

**No token/cost data** exposed here; correlate with Admin API to get it.

CLI handoff: prepending `&` to a CLI message pushes to Cloud Agents ([CLI changelog Jan 16, 2026](https://cursor.com/changelog/cli-jan-16-2026)).

**Verdict:** Parseable (official API), server-side only.

## Token / cost data — the hard nut

Not available locally: IDE DB, CLI output, hook payload, transcript JSONL — **none of them expose tokens or cost**.

Only path: **Cursor Admin API** ([docs](https://cursor.com/docs/account/teams/admin-api)).

Relevant endpoints:
- `/teams/daily-usage-data` — aggregated daily
- `/teams/spend` — spending totals
- `/teams/filtered-usage-events` — per-event detail

**`/teams/filtered-usage-events` response fields:**
- `timestamp`, `userEmail`, `model`, `kind`
- `tokenUsage`: `{ inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, totalCents }`
- `chargedCents`, `cursorTokenFee`, `isChargeable`, `maxMode`

Per-request granularity, not per-session. No `session_id` on usage events — would need to correlate by `(timestamp, user, model)`.

**Plan gate:** Admin API is **Enterprise-only**. API keys generated at `cursor.com/dashboard` → Settings → Cursor Admin API Keys.

Working open-source implementations:
- [ofershap/cursor-usage-tracker](https://github.com/ofershap/cursor-usage-tracker) — pulls these exact endpoints
- [Ittipong/cursor-price-tracking](https://github.com/Ittipong/cursor-price-tracking)
- [cursortokens.vercel.app](https://cursortokens.vercel.app/)
- [cursorusage.com](https://cursorusage.com/)

Community demand for per-session token reporting in-product is documented but not shipped: [forum feature request](https://forum.cursor.com/t/token-usage-and-costs-report-per-request-and-per-session/138980).

The `/usage` slash command in the CLI (added Jan 16, 2026) shows "Cursor streaks and stats" but isn't documented to emit parseable output.

## Summary matrix

| Surface | Parseable? | Source | Tokens/cost? |
|---|---|---|---|
| IDE SQLite DB | Yes, with effort — undocumented schema, migrations | Reverse-engineered, 10+ community tools | ✗ |
| CLI `-p --output-format json/stream-json` | Yes, officially | [docs](https://cursor.com/docs/cli/reference/output-format) | ✗ |
| CLI on-disk session store | Unknown location, implied by `agent ls`/`--resume` | Undocumented — needs inspection | ✗ |
| Hooks + `transcript_path` JSONL | Yes, officially | [docs](https://cursor.com/docs/hooks) | ✗ (except `preCompact` context tokens) |
| Cloud Agents API | Yes | [docs](https://cursor.com/docs/cloud-agent/api/endpoints) | ✗ |
| Admin API usage events | Yes | [docs](https://cursor.com/docs/account/teams/admin-api) | ✓ Enterprise-only, per-request |

## Recommendation for AX

**Primary integration surface:** Cursor hooks at `~/.cursor/hooks.json`. `sessionEnd` + `transcript_path` JSONL is a near-direct analog to AX's existing Claude Code integration. Live risk: CLI support for `sessionEnd` still in flux as of Jan 2026.

**Secondary:** CLI stream-json parsing for CI users invoking the CLI directly.

**Fallback:** SQLite DB reader for users on older Cursor without hooks, modeled on `0xSero/ai-data-extraction`'s multi-version handling.

**Token/cost:** Punt for local ingestion, or treat as Enterprise-tier feature via Admin API + `(timestamp, user, model)` correlation. Document the gap honestly per ADR-006.
