# Research: GitHub Copilot CLI (`@github/copilot`)

Research date: April 2026. Sources linked inline.

## Scope

The new agentic CLI distributed as `@github/copilot` on npm — GA date Feb 25, 2026 ([changelog](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)).

**Not to be confused with** the older `gh copilot suggest/explain` extension to the GitHub CLI — that's a different product with ephemeral one-shot commands and no session concept.

The [`github/copilot-cli`](https://github.com/github/copilot-cli) repo is NOT the source code — it contains only docs/installer/issue-tracker artifacts (`install.sh`, `README.md`, `changelog.md`, `LICENSE.md`, `.github/`). The actual CLI is distributed as a pre-built npm package. Source is closed.

## Install and invocation

- `npm install -g @github/copilot` (also Homebrew, WinGet)
- Auth via GitHub credentials, inherits org policies

Slash commands: `/plan`, `/fleet`, `/delegate`, `/diff`, `/agent`, `/skills`, `/model`, `/mcp`, `/usage`, `/context`, `/resume`, `/session`, `/rename`, `/share`, `/experimental show`, `/changelog`.

## Session storage

- Root config/state dir: `~/.copilot/` (override via `COPILOT_HOME`)
- Session transcripts: `~/.copilot/session-state/` — **JSONL** format
- SQLite index: `~/.copilot/session-store.db` — "a subset of the full data stored in the session files", supports `/chronicle`
- Logs: `~/.copilot/logs/` (override via `--log-dir`)

Sources: [chronicle doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle), [CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference).

**Schema of both files is NOT documented publicly.** The chronicle doc says each session records "your prompts, Copilot's responses, the tools that were used, and details of files that were modified." No field list, no SQL DDL, no JSONL record spec.

[DeepWiki's reconstruction](https://deepwiki.com/github/copilot-cli/3.4-model-selection-and-usage) (third-party reverse-wiki) mentions `~/.copilot/sessions/{id}.jsonl` — conflicts with the docs' `session-state/` path. Treat as approximate until verified empirically.

## Hooks system

Docs: [Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration), [Using hooks with Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks).

**Hook events:**
- `sessionStart` — new or resumed
- `sessionEnd` — complete/terminate; `reason` in `complete` / `error` / `abort` / `timeout` / `user_exit`
- `userPromptSubmitted`
- `preToolUse` — **only hook whose output can block execution** (return `{"permissionDecision": "deny", "permissionDecisionReason": "..."}`)
- `postToolUse` — `toolResult.resultType` in `success` / `failure` / `denied`, plus `textResultForLlm`
- `errorOccurred`

**Config:** `.github/hooks/*.json` in the repo. Example:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "./scripts/on-start.sh",
        "powershell": "./scripts/on-start.ps1",
        "cwd": ".",
        "timeoutSec": 10,
        "env": { "LOG_LEVEL": "INFO" }
      }
    ]
  }
}
```

**Stdin payload fields:** `timestamp` (unix ms), `cwd`, plus event-specific (`source`, `initialPrompt`, `reason`, `prompt`, `toolName`, `toolArgs`, `toolResult`, `error`).

**Critical limitation for AX:** Hooks are documented as **repo-level only** (`.github/hooks/`). No user-level `~/.copilot/hooks.json` equivalent to Claude Code's `~/.claude/settings.json`.

- Cloud agent variant: hooks file "must be present on your repository's default branch"
- CLI: "hooks are loaded from your current working directory"

`ax init`-style global hook installation is not supported. AX would need per-repo hook install.

## Config files

Multiple tiers ([CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference)):

| File | Scope |
|---|---|
| `~/.copilot/config.json` | User global defaults (model, theme, streaming, auto-update, trusted folders) |
| `~/.copilot/mcp-config.json` | User MCP servers |
| `~/.copilot/copilot-instructions.md` | User-level instructions |
| `~/.copilot/skills/` | User skills |
| `~/.copilot/agents/` | User custom agents |
| `.github/copilot/settings.json` | Repo shared config (committed) |
| `.github/copilot/settings.local.json` | Personal overrides (gitignored) |
| `.github/hooks/*.json` | Repo hooks |
| `.github/agents/*.agent.md` | Repo custom agents |
| `.github/skills/` | Repo skills |

**`config.json` schema is not published** — only a prose list of what it controls.

## Session data contents

Per [chronicle doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle):
- Prompts (user messages)
- Copilot responses (assistant messages)
- Tool uses (which tool, arguments)
- Files modified

DeepWiki describes a **MessageLog** (user/assistant messages) and **ToolLog** (tool call names + results), plus per-session `cwd`. Third-party, approximate.

**NOT documented:** exact JSONL record shape, whether each turn carries a timestamp, whether token counts are included, whether model ID is stamped per turn.

## `/resume` feature

- `/resume [SESSION-ID]` (picker if no ID)
- `--resume=SESSION-ID`, `--continue` (resumes most recent)
- `/session` (show session info), `/rename`
- `/share [file|gist]` (export as Markdown or GitHub Gist), `--share=PATH`, `--share-gist`

A past bug pre-v1.0.6 ("Session file is corrupted", [DeepWiki](https://deepwiki.com/github/copilot-cli/3.4-model-selection-and-usage)) implies session IDs correspond to filenames under `~/.copilot/session-state/`.

## Per-session cost / token exposure

**Likely not exposed per turn.** Known surfaces:
- `/usage` slash command and a "Remaining requests" status-bar widget ([CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference))
- Billing is in **"premium requests"** — every prompt counts as 1 (1× multiplier) regardless of model ([DeepWiki](https://deepwiki.com/github/copilot-cli/3.4-model-selection-and-usage))
- `/context` slash command shows "context window token usage and visualization" (live, unclear if persisted)

The chronicle doc makes **no mention** of token counts, dollar cost, or model-per-turn being persisted. For AX's ADR-009 (Token Cost per PR, Unmerged Token Spend), Copilot CLI will likely only surface **request counts**, not actual tokens — unless empirical inspection reveals otherwise.

## Model support

- Multi-provider: Anthropic, Google, OpenAI ([CLI landing page](https://github.com/features/copilot/cli))
- Default: Claude Sonnet 4.5 ([Oct 2025 changelog](https://github.blog/changelog/2025-10-03-github-copilot-cli-enhanced-model-selection-image-support-and-streamlined-ui/))
- `/model` slash command switches mid-session; current model shown above input
- Env var: `COPILOT_MODEL`

**Whether session file records model per assistant turn: NOT documented.** Given multi-model support, reasonable to assume it's recorded — needs empirical verification.

## AGENTS.md / Custom Agents / Skills

Three separate concepts:

**Custom instructions** ([docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)):
- Repo root `AGENTS.md` (primary), also reads `CLAUDE.md` and `GEMINI.md` for cross-tool compat
- `.github/copilot-instructions.md`
- `.github/instructions/**/*.instructions.md` with YAML frontmatter (`applyTo` glob, `excludeAgent`)
- `$HOME/.copilot/copilot-instructions.md`
- Extra dirs via `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`

**Custom agents** ([docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)):
- `.agent.md` files
- User: `~/.copilot/agents/`; repo: `.github/agents/`. User wins on collision.
- Invoked with `@AGENT-NAME` (used by `/fleet`)

**Agent Skills** ([docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills), [Dec 18, 2025 changelog](https://github.blog/changelog/2025-12-18-github-copilot-now-supports-agent-skills/)):
- `SKILL.md` with frontmatter (`name`, `description` required; `license`, `allowed-tools` optional)
- Locations — all supported as equivalents:
  - Personal: `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`
  - Project: `.github/skills/`, `.claude/skills/`, `.agents/skills/`
- Extra dirs via `COPILOT_SKILLS_DIRS`

**Copilot CLI reads Claude Code's directory conventions directly** (`CLAUDE.md`, `~/.claude/skills/`). A user running both tools shares authoring context automatically.

## Worktree handling

- Supports working inside a git worktree
- **No managed `~/.copilot/worktrees/` tree** analogous to Claude Code's `~/.claude/worktrees/`. Worktrees are ordinary user-created git worktrees.
- `/fleet` subagents run in parallel but docs don't describe subagent storage. Community posts (e.g., [discussion #179403](https://github.com/orgs/community/discussions/179403)) show users combining worktrees + `/fleet` manually.

## Comparison: Copilot CLI vs Claude Code

| Dimension | Copilot CLI | Claude Code |
|---|---|---|
| Session storage | `~/.copilot/session-state/` + `~/.copilot/session-store.db` | `~/.claude/projects/<encoded-path>/` JSONL |
| Format | JSONL + SQLite index | JSONL |
| Schema published? | No | Yes — stable field set |
| Hooks | `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred` | `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Notification`, `SubagentStop` |
| Hook config location | `.github/hooks/*.json` (repo-level only) | `~/.claude/settings.json` (user), `.claude/settings.json` (repo), `.claude/settings.local.json` |
| Hook payload | JSON on stdin: `timestamp`, `cwd`, event fields | JSON on stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, tool payloads |
| Deny contract | `{permissionDecision: "deny"}` | `{permissionDecision: "deny"}` or exit code 2 |
| Tool uses recorded | Yes, schema not published | Yes with full schema |
| Token counts per turn | Not documented as persisted | Yes: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| Model per turn recorded | Not documented | Yes: `message.model` |
| Billing unit | Premium requests (1× per prompt, model-agnostic) | Actual Anthropic API tokens priced per model |
| Resume | `/resume`, `--resume=ID`, `--continue` | `--resume`, `-r`, `--continue`, `-c` |
| User instructions | `~/.copilot/copilot-instructions.md` + reads `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | `~/.claude/CLAUDE.md` + project `CLAUDE.md` |
| Skills | `SKILL.md` in `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`, `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.claude/skills/` |
| Worktrees | No managed tree | `~/.claude/worktrees/` managed tree |
| Export | `/share file`, `/share gist`, `--share=PATH`, `--share-gist` (Markdown) | No built-in Markdown export |
| Source open? | No | No |

## Empirical Findings (April 25, 2026)

Findings from inspecting a real Copilot CLI session (v1.0.36, model gpt-5-mini). Session ID: `459987cf-cdb8-4ba0-9065-f470cbe762ce`, run against the `acroos/ax` repo.

### Directory Layout

Each session lives in its own subdirectory under `~/.copilot/session-state/<uuid>/`:

```
~/.copilot/
  config.json                          # Auto-managed: firstLaunchAt, loggedInUsers
  command-history-state.json           # Array of recent user prompt strings
  logs/
    process-<epoch>-<pid>.log          # Per-process structured logs
  ide/
    <uuid>.lock                        # IDE connection locks
  session-state/
    <session-uuid>/
      events.jsonl                     # Primary transcript — all events
      session.db                       # SQLite: todos + inbox (Copilot internal, NOT session metadata)
      workspace.yaml                   # Session metadata: id, cwd, git_root, repo, branch, timestamps
      checkpoints/
        index.md                       # Checkpoint history table (markdown)
      rewind-snapshots/
        index.json                     # Git-aware rewind points
      files/                           # Persistent session artifacts (may be empty)
      research/                        # Research artifacts (may be empty)
      vscode.metadata.json             # IDE metadata (empty `{}` for CLI sessions)
      inuse.<pid>.lock                 # Active session lock
```

**No `session-store.db` at `~/.copilot/`** — the docs mention it but it does not exist with `SESSION_INDEXING=false` (the default). Logs show `SESSION_INDEXING=false` on startup. This DB likely only exists when session sync is enabled.

**No `~/.copilot/hooks/` or `~/.copilot/settings.json`** — confirmed: no user-level hook configuration exists. Hooks are repo-level only (`.github/hooks/`).

**Session directories from IDE vs CLI:** Sessions opened from VS Code (via the IDE MCP server) create a directory with only `workspace.yaml` and `checkpoints/index.md` — no `events.jsonl` or `session.db`. Only CLI-initiated sessions produce events data.

### workspace.yaml Schema

```yaml
id: 459987cf-cdb8-4ba0-9065-f470cbe762ce
cwd: /Users/austinroos/dev/ax
git_root: /Users/austinroos/dev/ax
repository: acroos/ax        # owner/repo format — directly usable
host_type: github
branch: main
summary_count: 0
created_at: "2026-04-25T15:42:52.327Z"
updated_at: "2026-04-25T15:42:57.148Z"
summary: |                   # First user prompt (verbatim)
  Check out the file...
```

This is a useful index file — lighter than parsing the full events.jsonl. Contains `repository` in `owner/repo` format, which is what AX needs for repo identification.

### config.json Schema

```json
{
  "firstLaunchAt": "2026-04-25T15:26:38.960Z",
  "lastLoggedInUser": { "host": "https://github.com", "login": "acroos" },
  "loggedInUsers": [{ "host": "https://github.com", "login": "acroos" }]
}
```

Auto-managed. No hooks configuration here.

### events.jsonl Schema

The JSONL file uses a **one-event-per-line** format (NOT one-message-per-line like Claude Code). All events share a common envelope:

```json
{
  "type": "<event_type>",
  "data": { ... },
  "id": "<uuid>",
  "timestamp": "<ISO 8601 with ms>",
  "parentId": "<uuid|null>"
}
```

Events form a tree via `parentId` — each event references its logical parent. Timestamps are ISO 8601 with milliseconds (e.g., `"2026-04-25T15:42:52.339Z"`).

**Observed event types (16 events in sample session, 2 user turns):**

#### 1. `session.start`

```json
{
  "sessionId": "uuid",
  "version": 1,
  "producer": "copilot-agent",
  "copilotVersion": "1.0.36",
  "startTime": "2026-04-25T15:42:52.323Z",
  "context": {
    "cwd": "/Users/austinroos/dev/ax",
    "gitRoot": "/Users/austinroos/dev/ax",
    "branch": "main",
    "headCommit": "0cf802b4...",
    "repository": "acroos/ax",
    "hostType": "github",
    "repositoryHost": "github.com",
    "baseCommit": "0cf802b4..."
  },
  "alreadyInUse": false,
  "remoteSteerable": false
}
```

#### 2. `session.model_change`

```json
{ "newModel": "gpt-5-mini" }
```

Emitted at session start and whenever the user switches models via `/model`.

#### 3. `system.message`

```json
{ "role": "system", "content": "<full system prompt — 40,579 chars>" }
```

The system prompt includes `CLAUDE.md` content (Copilot reads it natively) embedded in a `<custom_instruction>` block.

#### 4. `user.message`

```json
{
  "content": "raw user text",
  "transformedContent": "<enriched with <current_datetime>, <reminder>, etc.>",
  "attachments": [
    { "type": "file", "path": "/path/to/file.md", "displayName": "@/path/to/file.md", "mentionIndex": 19 }
  ],
  "supportedNativeDocumentMimeTypes": [],
  "interactionId": "uuid"
}
```

`interactionId` groups the user message with all assistant turns that respond to it.

#### 5. `assistant.turn_start`

```json
{ "turnId": "0", "interactionId": "uuid" }
```

Marks the beginning of an assistant turn. `turnId` is a string counter ("0", "1", ...) scoped to the interaction.

#### 6. `assistant.message`

```json
{
  "messageId": "uuid",
  "content": "visible text response",
  "toolRequests": [
    {
      "toolCallId": "call_xxx",
      "name": "view",
      "arguments": { "path": "/path/to/file" },
      "type": "function",
      "intentionSummary": "view the file at /path/to/file."
    }
  ],
  "interactionId": "uuid",
  "reasoningOpaque": "<encrypted base64 — model reasoning>",
  "encryptedContent": "<encrypted base64 — full response>",
  "outputTokens": 509,
  "requestId": "CEDC:2D4E88:85C820:A7CEC3:69ECE0FD"
}
```

**Critical finding: `outputTokens` IS recorded per assistant message.** This is the total output tokens for that model response.

`reasoningOpaque` and `encryptedContent` are encrypted — these likely contain the model's chain-of-thought reasoning (similar to Claude's `thinking` blocks) and possibly the full unredacted response. Not parseable by third parties.

`toolRequests` embeds tool call details inline with the message (unlike Claude Code which records tool use as separate JSONL entries).

#### 7. `tool.execution_start`

```json
{
  "toolCallId": "call_xxx",
  "toolName": "view",
  "arguments": { "path": "/path/to/file" }
}
```

Links to `assistant.message.toolRequests[].toolCallId`.

#### 8. `tool.execution_complete`

```json
{
  "toolCallId": "call_xxx",
  "model": "gpt-5-mini",
  "interactionId": "uuid",
  "success": true,
  "result": { "content": "...", "detailedContent": "..." },
  "toolTelemetry": {
    "properties": {
      "command": "view",
      "options": "{\"truncateBasedOn\":\"tokenCount\",\"truncateStyle\":\"middle\"}",
      "inputs": "[\"path\",\"command\"]",
      "resolvedPathAgainstCwd": "false",
      "fileExtension": "[\".md\"]",
      "viewType": "file"
    },
    "metrics": {
      "resultLength": 12434,
      "resultForLlmLength": 12434,
      "responseTokenLimit": 32000
    },
    "restrictedProperties": {}
  }
}
```

**Model IS recorded per tool execution.** `toolTelemetry.metrics` includes `resultLength`, `resultForLlmLength` (may differ if truncated), and `responseTokenLimit`.

#### 9. `assistant.turn_end`

```json
{ "turnId": "0" }
```

Marks the end of an assistant turn.

#### 10. `session.info`

```json
{ "infoType": "folder_trust", "message": "Folder /path/to/repo has been added to trusted folders." }
```

Informational events (folder trust, etc.). Not critical for AX parsing.

#### 11. `session.shutdown` (Critical for AX)

Emitted when the session exits. **This is the most important event for AX** — it contains aggregate token counts that are NOT available per-turn.

```json
{
  "shutdownType": "routine",
  "totalPremiumRequests": 1,
  "totalApiDurationMs": 17060,
  "sessionStartTime": 1777131772323,
  "codeChanges": {
    "linesAdded": 0,
    "linesRemoved": 0,
    "filesModified": []
  },
  "modelMetrics": {
    "gpt-5-mini": {
      "requests": { "count": 2, "cost": 1 },
      "usage": {
        "inputTokens": 43786,
        "outputTokens": 1372,
        "cacheReadTokens": 20736,
        "cacheWriteTokens": 0,
        "reasoningTokens": 960
      }
    }
  },
  "currentModel": "gpt-5-mini",
  "currentTokens": 27339,
  "systemTokens": 9128,
  "conversationTokens": 7967,
  "toolDefinitionsTokens": 10241
}
```

**Key fields:**
- `modelMetrics` — **Per-model token breakdown** with `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`. Keyed by model ID, so multi-model sessions are properly segmented.
- `totalPremiumRequests` — Copilot billing unit count.
- `totalApiDurationMs` — Total time spent in model API calls.
- `codeChanges` — Lines added/removed and files modified (computed by Copilot, independent of tool telemetry).
- `currentTokens` / `systemTokens` / `conversationTokens` / `toolDefinitionsTokens` — Token composition at shutdown.

**Verified accuracy:** For the sample session, `modelMetrics.gpt-5-mini.usage.outputTokens` = 1,372, which matches the sum of per-turn `outputTokens` (509 + 863 = 1,372). The aggregate is consistent with the per-event data.

#### Not yet observed

- `assistant.thinking` — may exist for models that expose thinking, not observed with gpt-5-mini. The presence of `reasoningTokens` in `session.shutdown` suggests thinking does occur but may only be exposed via the encrypted `reasoningOpaque` field.

### Log File Format

Process logs at `~/.copilot/logs/process-<epoch>-<pid>.log` are structured:

```
2026-04-25T15:42:52.315Z [INFO] Session indexing debug: SESSION_INDEXING=false, ...
2026-04-25T15:42:57.582Z [INFO] CompactionProcessor: Utilization 15.6% (19951/128000 tokens) below threshold 80%
```

**The logs contain context window utilization data** (`CompactionProcessor: Utilization X% (N/M tokens)`) that is NOT in `events.jsonl`. This provides `input_tokens` and `max_context` per model call — but it's in unstructured log format, not the structured event stream.

### session.db Schema (SQLite)

The per-session SQLite database is for **Copilot's internal task management**, not session metadata:

```sql
CREATE TABLE todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'done', 'blocked')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE todo_deps (
    todo_id TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    PRIMARY KEY (todo_id, depends_on)
);

CREATE TABLE inbox_entries (
    id TEXT PRIMARY KEY,
    recipient_session_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    interaction_id TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 1,
    sent_at INTEGER NOT NULL,
    read_at INTEGER,
    notified_at INTEGER
);
```

Both tables were empty in the sample session. The `inbox_entries` table is interesting — it tracks inter-agent messages (`sender_type`, `recipient_session_id`), likely used by `/fleet` sub-agents.

### Copilot Tool Names

Observed and documented tool names (from system prompt and events):

| Copilot Tool | Claude Code Equivalent | Category |
|---|---|---|
| `view` | `Read` | File read |
| `edit` | `Edit` | File modify |
| `create` | `Write` | File create |
| `bash` | `Bash` | Shell command |
| `grep` | `Grep` | Content search |
| `glob` | `Glob` | File search |
| `task` | `Agent` (subagent) | Agent delegation |
| `sql` | N/A | Internal DB queries |
| `ask_user` | N/A | User interaction |
| `report_intent` | N/A | UI status reporting |
| `fetch_copilot_cli_documentation` | N/A | Self-help |

**Confirmed tool argument shapes (from empirical data):**

- `view`: `{ "path": "/abs/path" }` — same as Claude's `Read`
- `edit`: `{ "path": "/abs/path", "old_str": "...", "new_str": "..." }` — same as Claude's `Edit`
- `bash`: `{ "command": "...", "description": "...", "initial_wait": 120 }` — has `description` and `initial_wait` fields not present in Claude's `Bash`

**`tool.execution_complete` telemetry for edits** includes `linesAdded`, `linesRemoved`, and `filePaths` in the `toolTelemetry.metrics` and `toolTelemetry.restrictedProperties` fields. This provides per-edit code change data independent of `session.shutdown.codeChanges`.

For AX tool categorization:
- **File reads**: `view` tool calls
- **File modifications**: `edit`, `create` tool calls
- **Shell commands**: `bash` tool calls
- **Subagent delegation**: `task` tool calls (equivalent to Claude's `Agent`)
- **MCP tools**: Need to observe naming convention — likely prefixed differently than Claude's `mcp__` prefix

### Token and Cost Data Availability

| Data Point | Claude Code | Copilot CLI | Notes |
|---|---|---|---|
| Output tokens per turn | `message.usage.output_tokens` | `assistant.message.data.outputTokens` | **Available** per turn |
| Output tokens aggregate | Sum of per-turn | `session.shutdown.modelMetrics[model].usage.outputTokens` | **Available** — verified consistent with per-turn sum |
| Input tokens per turn | `message.usage.input_tokens` | **Not in events.jsonl** | Only available as aggregate |
| Input tokens aggregate | Sum of per-turn | `session.shutdown.modelMetrics[model].usage.inputTokens` | **Available** in session.shutdown |
| Cache write tokens | `message.usage.cache_creation_input_tokens` | `session.shutdown.modelMetrics[model].usage.cacheWriteTokens` | **Available** (aggregate only) |
| Cache read tokens | `message.usage.cache_read_input_tokens` | `session.shutdown.modelMetrics[model].usage.cacheReadTokens` | **Available** (aggregate only) |
| Reasoning tokens | N/A (included in output) | `session.shutdown.modelMetrics[model].usage.reasoningTokens` | **Available** — separate from outputTokens |
| Model per turn | `message.model` | `tool.execution_complete.data.model` + `session.model_change` | **Available** |
| Model per session | Majority vote from per-turn | `session.shutdown.currentModel` + `modelMetrics` keys | **Available** |
| Premium requests | N/A | `session.shutdown.totalPremiumRequests` | Copilot billing unit |
| API duration | N/A | `session.shutdown.totalApiDurationMs` | Total model API latency |
| Context window utilization | Not directly in JSONL | Logs: `CompactionProcessor: Utilization X% (N/M tokens)` | Unstructured log only |
| Token composition at shutdown | N/A | `currentTokens`, `systemTokens`, `conversationTokens`, `toolDefinitionsTokens` | **Available** — final context snapshot |
| Dollar cost | Computed from tokens + model pricing | **Can compute** from per-model token counts in session.shutdown | Need pricing table for Copilot models |
| Code changes | Derived from tool calls | `session.shutdown.codeChanges` (linesAdded, linesRemoved, filesModified) | **Available** — Copilot pre-computes this |

## Metric Feasibility Matrix

Mapping each AX metric to Copilot CLI data availability. Feasibility rated as: **Yes** (direct mapping), **Partial** (available with caveats), **No** (data not available).

### Delivery Metrics

| Metric | Feasibility | Source | Notes |
|---|---|---|---|
| Task Cycle Time | **Yes** | `session.start.data.startTime` + PR merge time | Same as Claude: needs PR correlation by branch |
| PR Throughput | **Yes** | GitHub data only | Not session-dependent |
| Post-Open Commits | **Yes** | GitHub data only | Not session-dependent |
| CI Success Rate | **Yes** | GitHub data only | Not session-dependent |
| Line Revisit Rate | **Yes** | GitHub data only | Not session-dependent |

### Session Effectiveness Metrics

| Metric | Feasibility | Source | Notes |
|---|---|---|---|
| Iteration Depth | **Yes** | Count `user.message` events | Direct mapping |
| Peak Context Window | **Partial** | Log parsing: `CompactionProcessor: Utilization X% (N/M tokens)` | Not in events.jsonl. The `session.shutdown` gives `currentTokens` but not peak. Logs have per-call utilization but are unstructured. |
| Autonomy Score | **Yes** | Count `assistant.message` / `user.message` events | Direct mapping |
| Token Cost per PR | **Yes** | `session.shutdown.modelMetrics[model].usage` has per-model input/output/cache tokens | Need pricing table for Copilot-served models (gpt-5-mini, etc.). Copilot bills by premium requests, but we have raw token counts for cost estimation. |
| Cache Hit Rate | **Yes** | `session.shutdown.modelMetrics[model].usage.cacheReadTokens` / `inputTokens` | Aggregate per session, not per turn. Sufficient for the metric. |
| Sidechain Rate | **No** | No sidechain concept in Copilot | Copilot doesn't have Claude's sidechain branching model |
| Re-Read Rate | **Yes** | Count `tool.execution_start` where `toolName=view` / unique paths | Direct mapping from tool events |

### Adoption Maturity Metrics

| Metric | Feasibility | Source | Notes |
|---|---|---|---|
| Skill & Tool Usage | **Partial** | Need to identify skill/MCP tool names in Copilot | Copilot has skills (SKILL.md) and MCP tools but naming convention in events needs verification with more session data |
| Subagent Delegation | **Yes** | Count `tool.execution_start` where `toolName=task` / total | Direct mapping (Copilot's `task` = Claude's `Agent`) |
| Rubber Stamp Rate | **Yes** | GitHub data only | Not session-dependent |

### Summary

- **12 of 15 metrics: fully feasible** (all 5 Delivery + Iteration Depth, Autonomy Score, Re-Read Rate, Token Cost per PR, Cache Hit Rate, Subagent Delegation, Rubber Stamp Rate)
- **2 of 15 metrics: partially feasible** (Peak Context Window via log parsing, Skill & Tool Usage pending tool name verification)
- **1 of 15 metrics: not feasible** (Sidechain Rate — no conceptual equivalent in Copilot)

## AX SessionData Field Mapping

How each field in `cli/internal/api/types.go:SessionData` maps to Copilot CLI data:

| AX Field | Copilot Source | Available? |
|---|---|---|
| `id` | `session.start.data.sessionId` | Yes |
| `branch` | `session.start.data.context.branch` or `workspace.yaml:branch` | Yes |
| `started_at` | `session.start.data.startTime` (convert ISO→unix ms) | Yes |
| `ended_at` | Last event timestamp (or `session.end` if it exists) | Yes (approximate if no session.end) |
| `message_count` | Count `user.message` events | Yes |
| `turn_count` | Count `assistant.turn_start` events | Yes |
| `input_tokens` | Sum across `session.shutdown.modelMetrics[*].usage.inputTokens` | Yes (aggregate) |
| `output_tokens` | Sum across `session.shutdown.modelMetrics[*].usage.outputTokens` (or sum per-turn `assistant.message.data.outputTokens`) | Yes |
| `cache_creation_input_tokens` | Sum across `session.shutdown.modelMetrics[*].usage.cacheWriteTokens` | Yes (aggregate) |
| `cache_read_input_tokens` | Sum across `session.shutdown.modelMetrics[*].usage.cacheReadTokens` | Yes (aggregate) |
| `total_cost_usd` | Compute from per-model token counts in `session.shutdown.modelMetrics` | Yes (need pricing table for Copilot-served models) |
| `primary_model` | `session.model_change.data.newModel` (majority vote if multiple changes) | Yes |
| `files_read_count` | Count unique `arguments.path` from `tool.execution_start` where `toolName=view` | Yes |
| `files_modified_count` | Count unique `arguments.path` from `tool.execution_start` where `toolName` in `edit`, `create` | Yes |
| `assistant_message_count` | Count `assistant.message` events | Yes |
| `sidechain_messages` | N/A (no sidechain concept) | Always 0 |
| `total_file_reads` | Count all `tool.execution_start` where `toolName=view` | Yes |
| `peak_context_pct` | Log file parsing (fragile) or omit | Partial |
| `total_tool_calls` | Count `tool.execution_start` events | Yes |
| `agent_tool_calls` | Count `tool.execution_start` where `toolName=task` | Yes |
| `skill_tool_calls` | Need to verify skill tool naming convention | Partial |
| `mcp_tool_calls` | Need to verify MCP tool naming convention | Partial |

## Parser Design Notes

### Structural differences from Claude Code parser

The Claude Code parser (`cli/internal/parsers/claude_sessions.go`) reads a flat JSONL where each line is a message (user, assistant, tool_result, etc.) with a `type` field and inline `message.usage` for token counts.

Copilot's events.jsonl is fundamentally different:
1. **Event-based, not message-based.** Each line is an event (session.start, assistant.turn_start, tool.execution_start, etc.), not a conversation message.
2. **Tree structure via `parentId`.** Events form a parent-child tree, not a flat sequence.
3. **Tool calls embedded in assistant messages.** The `assistant.message` event contains a `toolRequests` array, and separate `tool.execution_start`/`tool.execution_complete` events follow.
4. **Turns are explicit.** `assistant.turn_start`/`turn_end` delimit turns, rather than relying on message type transitions.

### Recommended parser approach

```
Parse events.jsonl line by line:
  - session.start        → Extract session metadata (id, cwd, repo, branch, startTime)
  - session.model_change → Track active model (for primary_model majority vote)
  - user.message         → Increment message_count
  - assistant.message    → Increment assistant_message_count
                          → Accumulate outputTokens
                          → Count tool requests (for tool call categorization)
  - tool.execution_start → Increment tool call counters
                          → Track file paths for files_read/files_modified
                          → Categorize: view=read, edit/create=modify, task=agent, bash=shell
  - assistant.turn_start → Increment turn_count
  - Last event timestamp → ended_at
```

### File discovery

Unlike Claude Code which stores sessions under `~/.claude/projects/<encoded-path>/`, Copilot stores all sessions in a flat list under `~/.copilot/session-state/<uuid>/`. The `workspace.yaml` file provides the repo association via `repository: owner/repo`.

Discovery path:
1. Scan `~/.copilot/session-state/*/workspace.yaml`
2. Read `repository` field to filter by target repo
3. Check for `events.jsonl` (skip IDE-only sessions that lack it)
4. Parse `events.jsonl` for session data

### Ingestion trigger

Two options:

**Option A: Hook-based (per-repo, matches Claude Code model)**
- Install `sessionEnd` hook in `.github/hooks/session-end.json` per repo
- Hook runs `ax push --repo <cwd>` on session completion
- **Downside:** Requires per-repo installation (no global hooks). UX regression from Claude's single `ax init`.

**Option B: File-based polling (global, simpler)**
- `ax push` scans `~/.copilot/session-state/*/workspace.yaml` to find sessions for the target repo
- Parses `events.jsonl` for each matching session
- Uses the same push-state tracking (`~/.ax/state/`) to avoid re-sending
- `ax push --all` discovers repos from all `workspace.yaml` files
- **Advantage:** No hook installation needed. Same UX as Claude Code.
- **Advantage:** `workspace.yaml` has `repository: owner/repo` directly — no `git remote` needed.

**Recommendation: Option B.** The file-based approach is strictly simpler. It avoids the hook installation UX problem entirely. The `workspace.yaml` file provides repo identification without needing to run git commands. And since `ax push` already runs after sessions (via Claude Code's hook), it can scan Copilot sessions at the same time.

## Remaining Gaps

Items from the original gaps list that are still unresolved:

1. ~~Exact JSONL record schema~~ → **Resolved.** Full event schema documented above.
2. ~~SQLite schema of session-store.db~~ → **Partially resolved.** The per-session `session.db` schema is documented. The global `session-store.db` does not exist with `SESSION_INDEXING=false` (the default).
3. ~~Directory layout~~ → **Resolved.** One subdirectory per session, documented above.
4. ~~Per-turn token counts~~ → **Resolved.** `outputTokens` exists per `assistant.message`. `inputTokens` does NOT exist in events.jsonl.
5. ~~Model per turn~~ → **Resolved.** Model recorded in `session.model_change` and `tool.execution_complete.data.model`.
6. ~~Timestamps~~ → **Resolved.** ISO 8601 with milliseconds on every event.
7. ~~config.json schema~~ → **Resolved.** Auto-managed: `firstLaunchAt`, `loggedInUsers`. No hooks or settings keys.
8. Subagent / `/fleet` storage → **Still unknown.** The `inbox_entries` table in `session.db` suggests inter-agent messaging exists. Need to run a `/fleet` session to verify whether sub-agents create separate session directories or share the parent's events.jsonl.
9. ~~User-level hooks~~ → **Resolved.** No `~/.copilot/hooks/` or hooks key in `config.json`. Repo-level only confirmed.
10. `sessionEnd` hook payload → **Still unknown.** Need to install a `.github/hooks/` sessionEnd hook and inspect the stdin JSON. However, this matters less if we go with file-based polling (Option B above).

### New questions from empirical inspection

11. ~~`session.end` event schema~~ → **Resolved.** The event is `session.shutdown` (not `session.end`). Full schema documented above. Contains comprehensive token and code change data.
12. **`assistant.thinking` event** — Not observed with gpt-5-mini. May appear with other models (e.g., Claude Sonnet via Copilot). The `reasoningTokens` field in `session.shutdown` suggests thinking occurs but may only be exposed via the encrypted `reasoningOpaque` field.
13. **MCP tool naming convention** — When Copilot invokes MCP tools (e.g., from the github-mcp-server), what prefix do the tool names use in `tool.execution_start`? Need a session that uses MCP tools.
14. **Skill tool naming convention** — When a skill (SKILL.md) is invoked, does it appear as a distinct tool name or as a `task` delegation?
15. **`/fleet` sub-agent events** — Do sub-agent tool calls appear in the parent's events.jsonl, or in separate session directories? The `inbox_entries` table suggests separate sessions, but needs verification.
16. **Copilot model pricing** — `session.shutdown.modelMetrics` gives per-model token counts, but computing dollar cost requires knowing per-token prices for Copilot-served models (gpt-5-mini, etc.). These are GitHub's internal models — pricing may not be published since Copilot bills by premium requests. AX may need to maintain its own pricing table or use estimated rates.
17. ~~`session.shutdown` with code changes~~ → **Resolved.** Verified with a session that edited, committed, and pushed a file. `codeChanges` correctly reports `{ linesAdded: 12, linesRemoved: 12, filesModified: ["/Users/austinroos/dev/seshql/README.md"] }`.

## Implications for AX (Updated)

### What works well

- **18 of 23 SessionData fields are available** (the 5 missing are `sidechain_messages` (N/A), `peak_context_pct` (partial), and the 3 tool-categorization fields pending naming verification).
- **12 of 15 metrics are fully feasible**, covering all 5 Delivery metrics + 5 Session Effectiveness + 2 Adoption Maturity. Only Sidechain Rate has no equivalent.
- **The `session.shutdown` event is a goldmine.** It provides per-model token breakdowns (input, output, cache read/write, reasoning), premium request counts, API duration, and code change summaries — all in one structured event.
- **File-based polling** (Option B) eliminates the per-repo hook installation problem entirely. `workspace.yaml` provides `repository: owner/repo` directly, simplifying repo identification.
- **Event structure is clean and well-typed.** Each event has a UUID, timestamp, and parent chain. Parsing is straightforward.
- **Session discovery is simpler** than Claude Code — flat directory structure, explicit repo field in workspace.yaml.
- **`tool.execution_complete` telemetry for edits** provides `linesAdded`, `linesRemoved`, and `filePaths` — richer than Claude Code's tool_result output.

### What doesn't work

- **No sidechain concept** → Sidechain Rate is the only metric with no Copilot equivalent. Set to 0/null.
- **Peak Context Window requires log parsing** → `session.shutdown` provides `currentTokens` (final state) but not peak across the session. Per-call peak is only in unstructured logs. Consider using `currentTokens / model_max_context` as a lower-bound approximation, or omit for Copilot MVP.
- **Model pricing uncertainty** → `session.shutdown.modelMetrics` gives real token counts, but computing dollar cost requires pricing for Copilot-served models. GitHub bills by premium requests, not tokens — per-token prices may not be public. AX can either estimate using known OpenAI/Anthropic rates (since Copilot routes to those models) or show "premium requests" as an alternative cost unit.

### Architecture recommendation

1. **New parser module:** `cli/internal/parsers/copilot_sessions.go` alongside the existing `claude_sessions.go`. Both return `ParsedSession` structs — the push payload doesn't need to change.
2. **Session discovery:** Add Copilot session discovery to `cli/internal/bulk/discovery.go`. Scan `~/.copilot/session-state/*/workspace.yaml`, filter by repo, parse matching `events.jsonl` files.
3. **Unified push:** `ax push --repo .` discovers both Claude Code and Copilot sessions for the target repo. `ax push --all` discovers all repos from both `~/.claude/history.jsonl` and `~/.copilot/session-state/*/workspace.yaml`.
4. **Server-side:** Add `agent_type` field to `sessions` table (`claude_code` or `copilot_cli`). Metrics that are N/A for Copilot (cache_hit_rate, sidechain_rate, token_cost_usd) should be NULL, not zero. Dashboard can show agent type badges.
5. **No hook changes needed.** Claude Code's existing `SessionEnd` hook already runs `ax push --repo <cwd>`. If the same repo has Copilot sessions, they'll be discovered and pushed automatically.

## Decisions (April 25, 2026)

Decisions made during planning discussion, prior to implementation:

1. **Agent type modeling** — Add `agent_type` column to `sessions` table (`claude_code`, `copilot_cli`). Per-session field in push payload. Default `claude_code` for backward compat.
2. **N/A metric handling** — Store NULL, not zero. SQL aggregates (AVG, etc.) skip NULLs naturally, so Copilot sessions won't dilute Claude-specific metric averages. Dashboard renders NULL as "—".
3. **Cost metric strategy** — **Drop dollar cost entirely.** Think exclusively in token counts. Tokens are the universal unit across providers. Users can do their own dollar math. This eliminates the Copilot model pricing problem and simplifies the Claude Code path too. Requires an ADR amendment to ADR-009.
4. **Copilot-specific fields** — Don't add to schema for MVP. Note them for future consideration: `premium_requests`, `reasoning_tokens`, `total_api_duration_ms`, `codeChanges`. Different tools may have different metrics available in the future.
5. **Dashboard filtering** — Agent type as a filter dimension (like time window). Default shows all agents combined. Agent type badges on session lists. One unified dashboard, no separate "Copilot view."

### Remaining verification (non-blocking)

1. **MCP and skill tool naming** — Run a session using MCP/skill tools to see naming convention in events.
2. **`/fleet` sub-agent data** — Run a `/fleet` session to verify storage model.
3. **`reasoningTokens` relationship to `outputTokens`** — Verify whether reasoning tokens are a subset of output tokens or additive. Affects token count interpretation.

## Source URLs

- [Copilot CLI landing page](https://github.com/features/copilot/cli)
- [@github/copilot on npm](https://www.npmjs.com/package/@github/copilot)
- [github/copilot-cli repo](https://github.com/github/copilot-cli) (docs only)
- [GA changelog Feb 25, 2026](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)
- [about-copilot-cli](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)
- [CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference)
- [Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [Using hooks with Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- [Chronicle doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle)
- [Add custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)
- [Create custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [Add skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
- [Fleet doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/fleet)
