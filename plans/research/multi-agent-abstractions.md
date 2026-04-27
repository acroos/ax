# Research: Plug-and-Play Abstractions for Future Agents

Research date: 2026-04-27.
Status: research only — no plan, no implementation.

## Goal

After PR #232 (Copilot CLI), AX has two agents wired in: Claude Code and Copilot CLI. The current shape of that integration is "two parallel paths that meet at the database row." This document asks: **what abstractions would let us drop in a third (Cursor) — and a fourth (Codex / Gemini CLI / Aider / OpenCode / Windsurf / Trae / next year's tool) — without re-wiring every layer?**

The goal is *plug-and-play*: adding a new agent should mean writing one provider implementation and registering it. It should not mean editing a literal-union type, a Ruby allowlist, a Postgres `CHECK`, an SQL `CASE`, three filter components, four hook installers, and a discovery loop.

This doc inventories where the coupling currently lives, uses Cursor as a stress test (because Cursor data is *very* different from Claude/Copilot), enumerates the abstraction surfaces, and lays out the design questions each surface forces. It deliberately stops short of recommending a plan — that's the next session's job.

Predecessor: [`current-coupling-audit.md`](current-coupling-audit.md) (April 2026, pre-Copilot). Several of its findings have since been resolved by the Copilot work (agent_type column exists, dollar cost is gone). This doc treats that audit as background and focuses on what's still ad-hoc *after* the Copilot integration.

## TL;DR

There are **seven abstraction surfaces** that today encode "Claude Code or Copilot CLI" implicitly:

1. **Agent identity** — a free-form string (`"claude_code"`, `"copilot_cli"`) duplicated across CLI, Rails allowlist, dashboard literal union, dashboard `LABELS` map, and a metrics-aggregator JOIN-keys hash.
2. **Session discovery** — two ad-hoc functions (`FindSessionFiles`, `FindCopilotSessionsForRepo`) called sequentially in two places (`main.go` push command + `bulk/discovery.go`). Each new agent appends another call.
3. **Session parsing** — `ParsedSession` is the shared output type, but the input shape is implicit: Claude expects flat-message JSONL, Copilot expects event-tree JSONL, and the dispatcher (`ParseSession` at `claude_sessions.go:317`) sniffs for `events.jsonl` to decide. There's no registry; new formats add a new branch.
4. **Tool taxonomy** — every parser hardcodes the agent's tool names (`Read`/`Edit`/`Write`/`Bash`/`Glob`/`Agent`/`Skill`/`mcp__*` for Claude; `view`/`edit`/`create`/`bash`/`task`/`mcp__*`/`mcp.*` for Copilot) and maps them to AX categories (file read / file modify / shell / subagent / mcp). Cursor has *different* names again (`ReadFile`/`ApplyPatch`/`Shell`/`Glob`).
5. **Metric availability per agent** — handled by ad-hoc `nil` / pointer-to-int dance: `SidechainMessages` and `PeakContextPct` are conditionally set in `ToSessionData()` based on agent type, and `push_service.rb:159` repeats the rule server-side. There's no declared "this agent does/doesn't support metric X" matrix.
6. **Hook installation** — two unrelated installers (`hooks.go` for Claude Code's `~/.claude/settings.json`; `copilot_hooks.go` for `<repo>/.github/hooks/session-end.json`). They write different file shapes, live in different scopes (user-global vs repo-local), and are orchestrated by hand in `main.go:initManagedMode`. Cursor's hooks (`~/.cursor/hooks.json` and `<repo>/.cursor/hooks.json`) would be a third shape.
7. **Repo identity from local state** — Claude infers it from project path → `git remote`; Copilot reads it directly from `workspace.yaml`'s `repository: owner/repo`; Cursor stores only a UUID in `repo.json` and the workspace path in `.workspace-trusted` — repo must be derived externally. No common interface.

The **headline finding** is that the right abstraction isn't "an agent interface" — it's two interfaces that almost-but-don't-quite line up:

- **Provider interface** in the CLI: how to discover, parse, and (optionally) install hooks for a session source. Implemented per agent.
- **Capability matrix** shared CLI ⇄ server ⇄ dashboard: a declarative "this agent supports metric X / produces field Y / surfaces tool category Z" table that drives validation, NULL semantics, dashboard filter labels, and metric-detail visibility.

The Cursor case reveals the second cleanly: Cursor exposes file-modification activity via a `scored_commits` table that *neither* Claude nor Copilot tracks, and *doesn't* expose tokens at all (they live in a paid Admin API). A literal-union `AgentType = "claude_code" | "copilot_cli"` and a hardcoded `SESSION_METRIC_EXPRESSIONS` map can't represent either fact.

The rest of this doc walks through each surface, what coupling exists today, what Cursor exposes, and what design questions follow.

---

## Coupling Inventory: After Copilot

Audit run on the worktree at `general-support-for-more-agents`, post-merge of PR #232.

### Surface 1 — Agent identity (string literal duplicated everywhere)

The string `"claude_code"` and `"copilot_cli"` appear as load-bearing values in at least the following places:

| Layer | File | Line(s) | What |
|---|---|---|---|
| CLI types | `cli/internal/api/types.go:23` | 23 | `AgentType string` field |
| CLI parser | `cli/internal/parsers/claude_sessions.go:69-85, 352` | 69, 75, 82, 352 | Default to `"claude_code"`; gate `PeakContextPct` and `SidechainMessages` setting on it |
| CLI parser | `cli/internal/parsers/copilot_sessions.go:99` | 99 | Hardcoded `"copilot_cli"` |
| Server schema | `server/db/schema.rb:213` | 213 | Column default `"claude_code"`, `null: false` |
| Server push | `server/app/services/push_service.rb:161, 189` | 161, 189 | `agent_type == "copilot_cli"` branch; default fallback `"claude_code"` |
| Server controller | `server/app/controllers/api/v1/base_controller.rb:88` | 88 | `VALID_AGENT_TYPES = ["claude_code", "copilot_cli"]` allowlist |
| Server metrics | `server/app/services/metrics_aggregator.rb:21-25` | 21-25 | `TASK_CYCLE_TIME_JOINS` hash keyed by these strings, with hand-written SQL JOIN per agent |
| Dashboard types | `dashboard/src/lib/db.ts:182` | 182 | `AgentType = "claude_code" \| "copilot_cli"` literal union |
| Dashboard utils | `dashboard/src/lib/utils.ts:16-18` | 16-18 | `parseAgentType` validator |
| Dashboard filter | `dashboard/src/components/agent-type-filter.tsx:14-18, 47-51` | 14-18, 47-51 | `LABELS` map + radio items |
| Dashboard mock | `dashboard/src/lib/mock/data.ts:532` | 532 | Hardcoded `idx % 3 === 0 ? "copilot_cli" : "claude_code"` |

**Symptom of plug-and-play failure:** adding "cursor_cli" requires a code edit in **every one of the rows above**. The string is also a public contract (CLI sends it, server validates it, dashboard reads it), so once shipped it can't be casually renamed.

### Surface 2 — Session discovery (one function per agent, called in series)

Two discovery entry points exist:

- `parsers.FindSessionFiles(claudeDir, projectPath)` — `cli/internal/parsers/claude_sessions.go:215-249`. Hardcodes Claude's path encoding (`/`→`-`, `.`→`-`) and worktree convention (`<encoded>--claude-worktrees-*`).
- `parsers.FindCopilotSessionsForRepo(copilotDir, ownerRepo)` — `cli/internal/parsers/copilot_discovery.go:44-60`. Globs `~/.copilot/session-state/*/workspace.yaml`, filters by `repository` field, requires `events.jsonl`.

These are wired together in two places:

- `cli/cmd/ax/main.go:258-267` (single-repo `ax push --repo`)
- `cli/internal/bulk/discovery.go:78-96, 124-139` (bulk `ax push --all`)

Both spots mention each agent by name and call the per-agent function. There's no registry, no iteration. **Adding cursor would need code edits in both spots, plus a new `FindCursorSessionsFor*` function.**

The two discovery functions also have *incompatible signatures* — Claude's takes a project filesystem path, Copilot's takes `owner/repo`. That's because Claude's local state is keyed by path, Copilot's is keyed by remote identity. A common interface has to abstract over both.

### Surface 3 — Session parsing (dispatcher with hardcoded sniff)

`parsers.ParseSession(path)` in `claude_sessions.go:317-345` is the unified entry point. Its dispatch logic:

```go
if info.IsDir() {
    if events.jsonl exists in path → ParseCopilotSession
    else → glob path/subagents/*.jsonl as Claude subagents
}
else → parse path as Claude top-level .jsonl
```

This works because Claude and Copilot happen to use distinct filesystem shapes (file vs directory; Claude subagent dir vs Copilot session dir distinguished by `events.jsonl` presence). It will keep working until we add a third agent that *also* uses a directory with a JSONL file inside. Cursor does exactly that (`agent-transcripts/<uuid>/<uuid>.jsonl`) — see Stress Test below.

The output type, `ParsedSession` (`claude_sessions.go:25-64`), is a shared struct. Most fields are agent-agnostic in name, but several are Claude-shaped in semantics:

- `PeakContextTokens` — only meaningful with per-message `usage.input_tokens` + cache deltas; Copilot supplies aggregate-only at shutdown so it's set to 0.
- `SidechainMessages` — Claude UI concept; Copilot has none.
- `PRURLs`/`CommitSHAs` — extracted from bash tool *output*; Claude returns it inline as `tool_result` blocks, Copilot returns it in `tool.execution_complete.data.result.content`. Cursor's transcript JSONL **excludes tool outputs entirely** (per docs and confirmed empirically — see below) so this field can't be populated for Cursor at all.

`ToSessionData()` (`claude_sessions.go:67-111`) does the agent-aware conversion to the wire format, applying the conditional NULL pattern: pointer-to-int / pointer-to-float so missing fields can be omitted.

### Surface 4 — Tool taxonomy (hardcoded per parser)

Each parser independently maps agent-specific tool names to AX's categories.

**Claude Code** (`claude_sessions.go:387-398, 562-587`):
- `Read`, `Glob` → file read
- `Edit`, `Write` → file modify
- `Bash` → shell, signal extraction
- `Agent` → subagent count
- `Skill` → skill count
- `mcp__*` → mcp count

**Copilot CLI** (`copilot_sessions.go:258-310`):
- `view`, `read_file` → file read
- `edit`, `create`, `edit_file`, `create_file` → file modify
- `bash`, `shell`, `run_command` → shell, signal extraction
- `task` → subagent
- `mcp__*` or `mcp.*` → mcp count
- (no skill equivalent observed)

**Cursor** (empirical — see Stress Test):
- `ReadFile`, `Glob` → file read
- `ApplyPatch` → file modify (and writes — Cursor uses one tool for both)
- `Shell` → shell, signal extraction
- `MCP` invocations: not yet observed, naming TBD

This taxonomy is duplicated and inconsistent. The category mapping (file read / file modify / shell / subagent / mcp / skill) is *itself* the abstraction — but it's open-coded as a `switch` per parser instead of a registered table.

### Surface 5 — Metric availability per agent (implicit, two-place rule)

The fact that "Copilot doesn't have sidechains" is encoded in three places:

1. CLI: `claude_sessions.go:81-85` — pointer to int set only when `agent_type == "claude_code"`.
2. Server: `push_service.rb:159-164` — `sidechain_messages_for(session_data)` returns nil when `agent_type == "copilot_cli"`.
3. Server: schema migration `20260425000001_replace_cost_with_agent_type.rb` made the column nullable so this would even be possible.

`PeakContextPct` follows the same shape but only at one site (CLI). Server stores whatever pointer-to-float comes in. The dashboard renders NULL as "—" via `?? "—"` patterns scattered through `metric-card.tsx` and the metric detail page.

There's no canonical answer to questions like:
- "Which metrics does Cursor support?"
- "Which metrics aggregate across heterogeneous agents safely?"
- "Should the dashboard show a 'sidechain rate' tile when filtered to `agent_type=copilot_cli`?"

The implicit answer to the third is "yes, render NULL as —", but that's an accident of how `MetricsAggregator` does `AVG()` over NULLs, not a stated contract. (`AVG` skips NULLs, so a Copilot-filtered query of sidechain_rate returns NULL because every row's `sidechain_messages` is NULL, which the dashboard renders as "—". That's the desired behavior but no test guards it.)

The dashboard *additionally* makes a UX choice in metric-detail pages (`me/metrics/[metric]/page.tsx:102`): only show the agent-type filter on session-derived metrics. That's a useful heuristic but it doesn't capture per-agent / per-metric availability.

### Surface 6 — Hook installation (two unrelated installers)

`cli/internal/hooks/hooks.go` (243 lines) installs into `~/.claude/settings.json`:
- User-global scope (writes to user's home).
- Hook events: `SessionEnd`, `Stop` (Claude-specific event names).
- File shape: `{ "hooks": { "SessionEnd": [{matcher, hooks: [{type, command, timeout, statusMessage}]}] } }`.
- Detects existing AX hooks via the `statusMessage` string `"Pushing session data to AX"`.
- Embeds an inline ~50-line bash one-liner (`pushCommand`) that handles worktree detection, logging, and exit-code reporting.

`cli/internal/hooks/copilot_hooks.go` (107 lines) installs into `<repo>/.github/hooks/session-end.json`:
- Repo-local scope (writes to current working directory's repo root).
- Hook events: `sessionEnd` (different name and casing).
- File shape: `{ "version": 1, "hooks": { "sessionEnd": [{type, bash, timeoutSec}] } }`.
- Detects existing AX hooks via `Bash` command containing `"ax push --repo"`.
- No worktree handling — Copilot hook just runs `ax push --repo .`.

Both are orchestrated by hand in `cli/cmd/ax/main.go:160-182`:

```go
hooks.Install(settingsPath, axBinary)            // Claude — always
if hooks.CopilotHomeExists() {                    // Copilot — opt-in
    hooks.InstallCopilot(repoPath)
}
```

**Symptom of plug-and-play failure:**

- Each new agent needs its own `<agent>_hooks.go` with its own file path, JSON shape, event names, hook detection logic.
- Each new agent needs its own `<Agent>HomeExists()` probe.
- Each new agent needs an explicit branch in `initManagedMode`.
- The "uninstall" path also has to know about every installer (`main.go:90-91`).

### Surface 7 — Repo identity from local state

Each agent has a *different* relationship between the local session and the GitHub repo it was working on:

| Agent | Where it stores repo identity | What's stored |
|---|---|---|
| Claude Code | Implicit — only `cwd`/`projectPath` | Must run `git remote get-url origin` and parse |
| Copilot CLI | `workspace.yaml:repository` | `owner/repo` directly |
| Cursor | `repo.json` (project UUID) + `.workspace-trusted` (cwd) | Cwd known, repo identity must be derived externally |

This is why the discovery functions have incompatible signatures. The right abstraction here is probably "give me the `(owner, repo, sessions[])` for everything you can see," with a callback for the agent to use the host's `git remote` resolver if it needs one. But it can't be entirely path-based (Claude) or entirely metadata-based (Copilot) — both are needed.

### Surface 8 — Pricing / token semantics (per provider, not per agent)

Today: `cli/internal/pricing/pricing.go` has an Anthropic-only model map. The Copilot integration sidestepped this by *removing dollar costs entirely* (PR #232) — tokens are now the unit of currency. That decision is reflected in `metrics_aggregator.rb:34` (`token-cost-per-pr` is now `input_tokens + output_tokens`).

But `pricing.LookupMaxContext` is still used for Claude's `peak_context_pct` calculation (`claude_sessions.go:77`). For Copilot, peak_context_pct is set to 0 because Copilot doesn't expose per-message context-window utilization. For Cursor, the answer is also 0 (no token data at all without the Enterprise Admin API).

**Future tension:** Cursor users on Enterprise plans *can* get tokens via the Admin API. That's a different ingestion shape entirely (server-side polled, not local-file-parsed), and it's per-user-API-key, not per-session. Worth flagging as a known mismatch even though it's out of scope for "the local-state agents."

---

## Stress Test: What Adding Cursor Would Reveal

Cursor data is the cleanest forcing function I have for "are these abstractions right?" because it breaks a different assumption at every layer. Findings below come from inspecting `~/.cursor/` directly, supplementing `plans/research/cursor.md`.

### Cursor's actual on-disk layout

```
~/.cursor/
  cli-config.json                # auth, model selection, sandbox, attribution
  agent-cli-state.json           # version + legacy field flag
  prompt_history.json            # array of recent user prompts (NOT per-session)
  statsig-cache.json             # feature flags (irrelevant)
  ai-tracking/
    ai-code-tracking.db          # SQLite — rich AI-authored-code tracking
  chats/
    <workspace-hash>/
      <agent-uuid>/
        store.db, store.db-wal, store.db-shm  # SQLite "store" of message blobs
  projects/
    <encoded-project-path>/
      .workspace-trusted         # workspacePath + trustedAt
      repo.json                  # { id: <uuid> }   ← project UUID, NOT owner/repo
      worker.log                 # codebase-sync logs (irrelevant)
      agent-transcripts/
        <agent-uuid>/
          <agent-uuid>.jsonl     # the actual transcript
  skills-cursor/                 # skill bundles (markdown, equivalent to ~/.claude/skills/)
```

**Path encoding:** `/Users/austinroos/dev/ax` → `Users-austinroos-dev-ax`. Strips the leading `/` and replaces remaining `/` with `-`. **Different from Claude** (which preserves the leading separator as `--` and *also* replaces `.`).

**No worktree convention.** Cursor doesn't manage worktrees the way Claude does (`~/.claude/worktrees/<name>`). Worktrees are ordinary git worktrees, and Cursor sees them as their own projects.

### Transcript shape (`agent-transcripts/<id>/<id>.jsonl`)

Each line is a message:

```json
{"role":"user","message":{"content":[{"type":"text","text":"<timestamp>...</timestamp>\n<user_query>\n...\n</user_query>"}]}}
{"role":"assistant","message":{"content":[
  {"type":"text","text":"..."},
  {"type":"tool_use","name":"Glob","input":{"glob_pattern":"README*","target_directory":"/Users/austinroos/dev/ax"}},
  {"type":"tool_use","name":"ReadFile","input":{"path":"/Users/austinroos/dev/ax/README.md"}}
]}}
```

This is **superficially closest to Claude Code's shape** (message-per-line, role + content blocks, `tool_use` blocks). But:

- **No top-level `uuid` / `parentUuid`** — no message-tree structure.
- **No top-level `timestamp`** — timestamps are *embedded inside the user message text* as `<timestamp>...</timestamp>` blocks. This is documented behavior but it means parsing has to crack the text content to get a session timeline. Per-message latency is unrecoverable.
- **No `usage` block on assistant messages** — no input/output/cache token counts at all.
- **No `model` field** — model is in `cli-config.json` globally and `conversation_summaries.model` in the AI-tracking DB; not per-message.
- **No tool_result lines** — tool outputs are deliberately excluded from the transcript per Cursor docs ("can be very large"). Means PR-URL extraction (Claude/Copilot signal) is impossible from the transcript. Would require either the per-chat `store.db` blob store or scraping `worker.log`.
- **Tool names are different again:** `ReadFile` (vs Claude's `Read`, Copilot's `view`); `ApplyPatch` (vs `Edit`, `edit`); `Shell` (vs `Bash`, `bash`). `ApplyPatch` has a `*** Begin Patch / *** Update File / *** End Patch` text-format payload — it's a *unified* edit/write operation, no separate `Write` tool.
- **Shell command schema is different:** `{command, working_directory, description, timeout?}`. Claude's `Bash` has `{command, description?}`; Copilot's `bash` has `{command, description, initial_wait}`. None overlap fully.

### Per-chat store.db (the message body store)

```sql
CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
```

`meta.value` for key `0` decodes as JSON (it's hex-encoded in the SQLite column):
```json
{"agentId":"<uuid>","latestRootBlobId":"<hash>","name":"Readme Reviewer","mode":"default","isRunEverything":true,"createdAt":1777315398982,"lastUsedModel":"default"}
```

So *some* session metadata is here that's NOT in the transcript: `name` (auto-generated chat title), `createdAt` (epoch ms), `mode`, `lastUsedModel`. The `blobs` table contains content-addressed blobs (hex hashes) — likely the actual message content tree, since the transcript JSONL is missing IDs. **Schema not documented; would require empirical reverse-engineering.**

### `ai-tracking/ai-code-tracking.db` — the killer feature Cursor exposes alone

```sql
CREATE TABLE ai_code_hashes (hash, source, fileExtension, fileName, requestId, conversationId, timestamp, model, createdAt);
CREATE TABLE scored_commits (commitHash, branchName, scoredAt, linesAdded, linesDeleted,
                             tabLinesAdded, tabLinesDeleted, composerLinesAdded, composerLinesDeleted,
                             humanLinesAdded, humanLinesDeleted, blankLinesAdded, blankLinesDeleted,
                             commitMessage, commitDate, v1AiPercentage, v2AiPercentage,
                             PRIMARY KEY (commitHash, branchName));
CREATE TABLE conversation_summaries (conversationId, title, tldr, overview, summaryBullets, model, mode, updatedAt);
CREATE TABLE tracked_file_content (gitPath, content, conversationId, model, fileExtension, createdAt);
CREATE TABLE tracking_state (key, value);
```

`scored_commits` is striking. For every git commit Cursor sees, it stores:
- AI-authored line count (split into Composer vs Tab vs Human)
- A v1 and v2 "AI percentage" estimate
- Linkage to the source `branchName` and `conversationId`

This is **per-commit AI-authorship attribution that neither Claude nor Copilot exposes locally.** It's a real signal — sample data shows `v1AiPercentage: 100.00, v2AiPercentage: 100.00` for the README PR commit. AX has no schema for "this commit was X% AI-authored" today.

`conversation_summaries` provides session-level summaries (title, tldr, overview) that Claude/Copilot don't have either. Could power a far more useful "session list" UI than the current "started 5m ago" timeline.

### What Cursor exposes vs. what AX models

| AX `SessionData` field | Cursor source | Notes |
|---|---|---|
| `id` | transcript filename / `meta.value.agentId` | UUID |
| `agent_type` | constant `"cursor_cli"` | TBD |
| `branch` | not in transcript; in `scored_commits.branchName` per-commit | Best-effort: latest scored-commit branch for the conversation, or omit |
| `started_at` | `meta.value.createdAt` (epoch ms) or first `<timestamp>` in user msg | Epoch ms |
| `ended_at` | last `<timestamp>` in transcript or `conversation_summaries.updatedAt` | Approximate |
| `message_count` | count of `role=user` lines | Direct |
| `turn_count` | count of `role=assistant` lines (Cursor doesn't have explicit turn boundaries) | Approximate |
| `input_tokens` / `output_tokens` / cache | **NOT AVAILABLE locally** | Enterprise Admin API only; correlate by (timestamp, user, model) |
| `primary_model` | `meta.value.lastUsedModel` or `conversation_summaries.model` | Often `"default"` / `"composer-2-fast"` |
| `files_read_count` | count unique `path` from `ReadFile` tool_use | Direct |
| `files_modified_count` | count unique file from `ApplyPatch` text payload | Need patch parser |
| `assistant_message_count` | count of `role=assistant` lines | Direct |
| `sidechain_messages` | N/A | Always NULL |
| `total_file_reads` | count all `ReadFile` tool_use | Direct |
| `peak_context_pct` | N/A locally | NULL or via Admin API |
| `total_tool_calls` | count tool_use blocks | Direct |
| `agent_tool_calls` | 0 (no subagent concept in Cursor CLI as of Apr 2026) | Always 0 or NULL |
| `skill_tool_calls` | unclear — skills exist (`~/.cursor/skills-cursor/`) but invocation in transcript not verified | Needs more data |
| `mcp_tool_calls` | not observed in this session, naming TBD | Needs more data |
| **(new) `commit_attribution`** | `scored_commits.v2AiPercentage`, `humanLinesAdded`, `composerLinesAdded` | Cursor-only; would justify schema growth |
| **(new) `conversation_summary`** | `conversation_summaries.tldr` | Cursor-only |

### Forcing-function takeaways from Cursor

1. **The dispatcher in `ParseSession` breaks.** Cursor's `agent-transcripts/<uuid>/<uuid>.jsonl` is a directory containing a JSONL file — but the JSONL is *not* `events.jsonl` and is *not* Claude-shaped. The current sniff (`if directory contains events.jsonl → Copilot, else Claude subagents`) misclassifies a Cursor session.
2. **Discovery doesn't have a single shape.** Cursor uses path-encoded project directories (`Users-austinroos-dev-ax`), like Claude — but with a different encoding scheme. The "right" interface is "pass me the local repo path AND the owner/repo AND the git-remote resolver, return matching sessions." Different from both Claude (path-only) and Copilot (owner/repo-only).
3. **Tool taxonomy must be a registered map, not a switch.** Three agents, three name spellings of "read this file." A new agent shouldn't require editing each parser; it should declare its mapping.
4. **Tokens are not universal.** Cursor's local data has zero token counts. Treating tokens as required would silently produce 0/0/0/0 for every Cursor session and the `token-cost-per-pr` metric would erroneously include Cursor sessions in averages-of-zeros. Either tokens are NULL-able (current schema allows this since they default to 0 — but 0 ≠ NULL!) or the agent declares "I don't supply token data" and the aggregator skips.
5. **The `defaults: 0` columns hide capability gaps.** All token columns and most counters in the `sessions` table use `default: 0` — there's no way to distinguish "agent supplied 0" from "agent didn't supply." This is fine for Claude/Copilot (both supply). For Cursor it's wrong: 0 input tokens is a lie. Capability matrix would tell the aggregator "for cursor_cli, treat input_tokens as NULL not 0." OR every counter becomes nullable and the parser explicitly nullifies what the agent doesn't support.
6. **Some agents bring their own metrics.** `scored_commits` is interesting because it's a metric-relevant signal AX doesn't model. A plug-and-play architecture should at minimum allow agent-specific data to land in a per-agent JSONB blob without schema changes; ideally, a capability declaration could *promote* a Cursor-specific signal to a typed column when it's worth standing up an AX metric for it.
7. **The `Cursor Admin API` is a separate ingestion mode.** Reading tokens from the Cursor Enterprise Admin API is server-side polling, not local-file parsing. The "agent provider" abstraction in the CLI doesn't model this naturally. It might warrant a parallel "server-side agent provider" abstraction — or at least a plan for how externally-sourced data joins agent-typed sessions.
8. **Hooks scope expands to a 2D matrix.** Cursor supports both `~/.cursor/hooks.json` (user) AND `<repo>/.cursor/hooks.json` (repo). Claude is user-only; Copilot is repo-only. The hook-installer abstraction must handle both scopes per agent — and per-event eligibility (CLI vs IDE).

---

## The Seven Abstraction Surfaces (Design Sketches)

Each subsection lays out: what coupling is there now, what the Cursor data forces, what an abstraction could look like, and what design questions arise. Solutions are sketched, not chosen.

### Surface A — Agent registry (one source of truth for "what agents exist")

**Today:** the agent string list is duplicated in 11 places (see Surface 1 inventory).

**Forcing function:** every new agent currently requires those 11 edits. Type systems can catch some (the literal union breaks compilation), but Ruby's `VALID_AGENT_TYPES` and the dashboard `LABELS` don't fail loudly when an unknown agent_type lands.

**Sketch options:**

- **A1 — Code-defined registry, generated everywhere.** A single source-of-truth file (e.g. `agents.toml` or `agents.json`) lists each agent: id, display name, color, capability flags. Code-generation produces:
  - Go constants (`internal/agents/registry.go`)
  - Ruby module (`config/initializers/agents.rb` with `VALID_AGENT_TYPES`)
  - TypeScript const (`dashboard/src/lib/agents.ts` with the union and labels)
  - SQL CHECK constraint (migration).

  Pros: one diff per new agent. Type-safe in TS and Go. Cons: codegen pipeline.

- **A2 — Server-defined registry, fetched.** Server owns the list (`/api/v1/agents`); CLI hardcodes a fallback for offline use; dashboard fetches at build time. Adding an agent is a server config change. Pros: ship-without-redeploy story for the dashboard. Cons: the CLI parser still has to know about the agent's session shape — registry alone doesn't help there.

- **A3 — Capability-driven, no central list.** Agents are discovered at runtime by the parsers/installers that implement them. The "list of valid agent_types" comes from "the union of providers registered in the CLI binary." Server validates against `Set.new(CodingSession.distinct.pluck(:agent_type))`. Cons: server has no way to enforce "this is a known agent" until at least one session arrives; dashboard label fallback to titlecased identifier.

**Design questions:**
- Is `agent_type` a stable enum or an open vocabulary? (Today: open string column with allowlist — the worst of both.)
- Should agent identity include *version* (e.g., distinguish Cursor CLI v1 vs IDE)? Schema has no provision today.
- Is "model provider" (Anthropic, OpenAI, Google, etc.) part of agent identity or orthogonal? Cursor calls Sonnet via OpenAI's API today; Copilot routes to Claude/Gemini/GPT. Probably orthogonal — but the `current-coupling-audit.md` already flagged that the schema lacks a `model_provider` column.

### Surface B — Provider interface (CLI: discovery + parsing)

**Today:** two parallel functions for discovery, two for parsing, glued in two call-sites.

**Forcing function:** Cursor's signature doesn't fit either existing function (path-and-owner-repo, different file format).

**Sketch — interface in Go:**

```go
// AgentProvider is the parser/discovery contract for one agent.
type AgentProvider interface {
    // ID returns the agent_type string written to the wire.
    ID() string

    // DiscoverSessions returns session paths for the given target.
    // The target may be a repo (owner+repo+local path) or "all repos" (callback).
    DiscoverSessions(target DiscoveryTarget) ([]SessionLocator, error)

    // Parse turns a SessionLocator into a ParsedSession.
    Parse(loc SessionLocator) (*ParsedSession, error)

    // Capabilities declares which optional fields/metrics this agent supports.
    Capabilities() AgentCapabilities
}

type DiscoveryTarget struct {
    OwnerRepo  string         // "owner/repo" — may be empty for global discovery
    LocalPath  string         // filesystem path — may be empty
    GitRemoteFn func(string) (owner, repo string, err error)
}

type SessionLocator struct {
    AgentID  string
    SessionID string
    Path      string  // file or directory, agent-specific
    OwnerRepo string  // resolved when known at discovery time
}
```

The CLI's main + bulk would iterate over a registered slice of providers:

```go
for _, p := range providers {
    locs, _ := p.DiscoverSessions(target)
    for _, loc := range locs {
        sess, _ := p.Parse(loc)
        ...
    }
}
```

**Design questions:**

- Should `Parse` take a stream / `io.Reader` to allow unit-testing without filesystem fixtures, and to allow future remote-fetched session data (e.g., Cursor Admin API records)?
- Should discovery be cancellable / lazy? Bulk discovery today loads everything eagerly — for users with thousands of sessions across many repos this could matter.
- How does each provider declare its on-disk root (`~/.claude`, `~/.copilot`, `~/.cursor`) for testability? Currently each parser has a `Default*Dir()` function with env-var override; that pattern is fine but should be part of the interface.
- Does `ParsedSession` stay a single struct, or split into "core fields every agent supplies" + "optional capability blobs"? Splitting helps capability declarations, but adds plumbing.
- What happens when a session can't be parsed — skip silently, log, fail loudly? Today: claude_sessions silently skips unparseable JSONL lines, copilot_sessions silently skips unparseable events. No telemetry on skip rate.

### Surface C — Session shape contract (`ParsedSession` and capability matrix)

**Today:** `ParsedSession` is a flat Go struct. `SessionData` (wire format) is the same shape. NULL vs zero is not encoded for most fields.

**Forcing function:** Cursor supplies *zero* token data and a Cursor-specific commit-attribution signal. Today's struct can't represent either honestly.

**Sketch:**

- Make every "may not be supplied" counter an explicit `*int` / `*float`. Today's `int` defaulting to 0 conflates "agent reports zero" with "agent doesn't track this."
- Add a `Capabilities` blob to the session payload, listing which fields are present. Server validates: if `capabilities.input_tokens` is false but `input_tokens` is non-nil, reject. Server uses capability flags when filtering aggregators.
- Reserve a per-agent `extras: jsonb` column on `sessions` for agent-specific data (e.g., Cursor's commit attribution). Schema-less landing zone, dashboard ignores by default but a future agent-specific tile can read it.

**Design questions:**

- Should `agent_type` move from a top-level column to a `provider: { id, version, capabilities[] }` object? Affects every query.
- What's the migration strategy for tokens? The current 0-default columns are wrong for Cursor. Could:
  - Make them nullable now (cheap migration).
  - Keep 0 default; add `tokens_recorded: bool` flag.
  - Add per-row capability bitmap.
- Per-message (Claude) vs per-session-aggregate (Copilot) vs not-available (Cursor) creates a 3-way split for token reporting. The session-level fields are fine for Copilot/Cursor, but lose information for Claude. Worth modeling? (Today: not modeled.)

### Surface D — Tool taxonomy (the category mapping)

**Today:** each parser hardcodes the agent's tool name → AX category mapping in a `switch`.

**Forcing function:** every new agent has at least one differently-named tool. Cursor has `ReadFile` instead of `Read`/`view`; `ApplyPatch` instead of `Edit`/`Write`/`edit`/`create`.

**Sketch — declarative mapping:**

```go
// In each provider's package:
var cursorToolMap = ToolCategoryMap{
    Read:    {"ReadFile", "Glob"},
    Modify:  {"ApplyPatch"},
    Shell:   {"Shell"},
    Subagent: {/* none */},
    Skill:   {/* tbd */},
    MCP:     prefixMatch{"mcp__", "mcp.", "MCP"}, // pattern-based
}
```

Plus an extractor function per category that pulls the relevant input field (e.g., `path` for read, file argument for modify) since *those* differ too.

**Design questions:**

- The categories themselves (read/modify/shell/subagent/skill/mcp) are an AX-internal taxonomy. Are they the right shape long-term? Cursor's `ApplyPatch` is *both* a write and an edit; we currently count those separately. Does the taxonomy need a "modify" supertype, or are AX metrics specifically about the *count* of modifications regardless of edit-vs-create?
- MCP detection is currently *prefix-based* (`mcp__` and `mcp.`). What about agents that don't use a name prefix (Cursor — TBD)? A capability-declared "MCP detector regex" per agent might be needed.
- The "skill" category exists because Claude's Skill tool was a thing; Copilot has skills too but they may invoke as `task` in the transcript; Cursor has `~/.cursor/skills-cursor/` but invocation naming is unverified. We may be tracking a Claude-shaped concept too narrowly.

### Surface E — Metric availability matrix (declarative per-agent / per-metric)

**Today:** ad-hoc nil-vs-zero in two places (`claude_sessions.go:75-85` + `push_service.rb:159-164`).

**Forcing function:** Cursor would silently produce 0/0/0/0 for every token-derived metric. Sidechain rate is N/A for Cursor. Peak context window is N/A locally.

**Sketch — declared matrix:**

```yaml
# agent_capabilities.yaml — single source of truth
claude_code:
  fields:
    input_tokens: true
    output_tokens: true
    cache_creation_input_tokens: true
    cache_read_input_tokens: true
    sidechain_messages: true
    peak_context_pct: true
  metrics:
    iteration-depth: true
    cache-hit-rate: true
    sidechain-rate: true
    peak-context-pct: true
    re-read-rate: true
    autonomy-score: true
    skill-tool-usage: true
    subagent-delegation: true
    token-cost-per-pr: true

copilot_cli:
  fields:
    input_tokens: true            # session-aggregate only
    output_tokens: true
    cache_creation_input_tokens: true
    cache_read_input_tokens: true
    sidechain_messages: false
    peak_context_pct: false
  metrics: { ... sidechain-rate: false, peak-context-pct: false, ... }

cursor_cli:                        # hypothetical
  fields:
    input_tokens: false
    output_tokens: false
    sidechain_messages: false
    peak_context_pct: false
  metrics:
    iteration-depth: true
    re-read-rate: true
    autonomy-score: true
    token-cost-per-pr: false
    cache-hit-rate: false
    sidechain-rate: false
    peak-context-pct: false
```

This file would drive:
- Push validation (server rejects payload if a `false`-capability field is set).
- Aggregator filters (when `agent_type=cursor_cli`, skip token-derived metrics).
- Dashboard filter UX (only show the `agent_type` filter on metrics where ≥2 agents support it; otherwise pin to the supporting agent).
- Detail page rendering (NULL → "N/A for this agent" instead of "—").

**Design questions:**

- Is this matrix part of the agent registry (Surface A), or its own artifact?
- How does the dashboard *learn* the matrix — fetched from server at runtime, or compiled in?
- When a metric is not supported, should the dashboard hide the tile entirely, render "N/A", or render "—" (current)? UX call.
- Should it be more granular — e.g., "Cursor supports tokens but only via Admin API and only for Enterprise users"? This points toward a richer than yes/no flag (e.g., `tokens: { source: "admin_api", requires: "enterprise" }`).
- Aggregators currently use `AVG` over NULLs (which works because NULLs are skipped). If a metric is supported by *some* agents, an unfiltered "all agents" average will be biased toward the supporting agents. Is that a feature or a bug? (Today: undocumented; probably bug.)

### Surface F — Hook installer interface

**Today:** two file-shaped installers, each unique.

**Forcing function:** Cursor needs a third (or fourth — it has user *and* repo scope). Codex, Aider, Gemini CLI all have their own conventions.

**Sketch — installer interface:**

```go
type HookInstaller interface {
    AgentID() string
    HomeExists() bool                  // check if the agent is even on this machine
    Install(ctx HookInstallContext) (Result, error)
    Uninstall(ctx HookInstallContext) error
    Detect(ctx HookInstallContext) (bool, error)  // is AX hook present?
}

type HookInstallContext struct {
    AxBinary string     // resolved path to ax
    RepoPath string     // current cwd (for repo-scope hooks)
    HomeDir  string     // user home (for user-scope hooks)
}
```

`ax init` iterates over registered installers, calling each one's `HomeExists` first; installs only when present. Uninstall iterates all and best-effort removes each.

A common helper shouldering the bash one-liner generation might further deduplicate:

```go
type PushCommandSpec struct {
    AxBinary       string
    LogPath        string
    WorktreeMarker string  // agent-specific worktree marker, e.g. "/.claude/worktrees/" or "/.cursor/worktrees/"
}

func GeneratePushCommand(spec PushCommandSpec) string { ... }
```

**Design questions:**

- Should installers manage *both* user-scope and repo-scope hooks? Cursor would need both. Today they're separate functions.
- Repo-scope hooks (Copilot, Cursor) are committable files — does AX guide users to commit them? Today: a print message says "commit this file." Could be more proactive (offer to add to `.gitignore`, or auto-commit). Out of scope here, but the abstraction should leave room.
- IDE-only agents (Cursor IDE) have no `sessionEnd` hook today. Is "no hook, file-polling fallback" a third installer mode?
- How does AX know when to *update* a previously-installed hook (e.g., the bash one-liner changed across AX versions)? Today: detection via status-message magic strings. Brittle.

### Surface G — Server-side: schema, ingestion, aggregation

**Today:** `sessions.agent_type` is a `string DEFAULT 'claude_code' NOT NULL`. Filterable via `apply_agent_type_filter`. `task_cycle_time` has a literal hash of pre-rendered SQL JOINs per agent (`metrics_aggregator.rb:21-25`). All other metrics are agent-agnostic in SQL — they happen to give correct results because of how NULLs propagate.

**Forcing function:** Adding Cursor would (a) require a migration that allows NULL in token columns, (b) require new SQL JOIN entries for every query with task-cycle-time-style per-agent variations, (c) potentially require a new sessions-extras column for commit-attribution data, (d) require updating the server allowlist.

**Sketch:**

- **Move agent-aware SQL generation out of literal hashes.** `TASK_CYCLE_TIME_JOINS` is a hand-edited 3-key hash. With N agents this gets gnarly. A small SQL builder that takes `agent_filter: nil | "claude_code" | ...` and produces the right JOIN/WHERE would scale.
- **Make the metric expressions table aware of capability.** `SESSION_METRIC_EXPRESSIONS` is a bare `slug → SQL` hash today. Adding `requires: [:input_tokens, :sidechain_messages]` to each entry would let the aggregator skip metrics for agents that don't support those fields, and the dashboard could query "which metrics apply to agent X" from the server.
- **Allow per-session JSON extras.** `sessions.extras: jsonb` (nullable) for agent-specific signals. Future-proofs against schema churn. Cost: more queries become "select extras->'commit_attribution' as ..." which is harder to index.
- **Distinguish "field absent" from "field zero".** Either:
  - Make all token / counter columns nullable; parser sets NULL when not supplied.
  - OR add a per-row JSON "supplied" capability blob (overkill).
  - OR rely on `agent_type` lookup against the capability matrix (deferred lookup; some queries need the matrix at query time).

**Design questions:**

- Brakeman pattern (`# brakeman:disable SQLInjection — frozen constant`) is workable today but every per-agent hash entry is hand-crafted SQL. Long-term: more hashes or a SQL builder?
- Is `agent_type` stored on `sessions` only, or should `prs` and `commits` also carry an agent attribution? (Today: no.) Cursor's `scored_commits` would suggest yes for commits, at least.
- The `MetricsAggregator.task_cycle_time_join_for(agent_type)` lookup — is per-metric agent-specific SQL the wrong abstraction, or just a coincidental hot-spot? Today it's the only metric that needs agent-aware SQL and it's there because task cycle time joins to sessions. A general "this metric reads sessions, optionally filtered by agent_type" pattern in the aggregator might subsume it.
- What about cross-agent sessions for the same PR? A user might use Claude *and* Cursor on the same task. Today task-cycle-time pulls "first session start" — if that's a Cursor session and the rest are Claude, the agent-filtered cycle-time metric ignores it. Is the abstraction "filter by agent" or "filter sessions, then compute"?

### Surface H — Dashboard: filter UI, mock data, NULL rendering

**Today:** `AgentTypeFilter` is hardcoded with `claude_code` / `copilot_cli` strings and labels. `mock/data.ts` hardcodes the same. Pages thread `agent_type` through props and URLs.

**Forcing function:** Adding a third agent requires editing `LABELS`, the radio items, the literal union, the parse function, and the mock generator.

**Sketch:**
- `AgentTypeFilter` reads from a registry (Surface A) instead of hardcoded.
- Mock data takes the agent list as input.
- A higher-order pattern: `with-agent-type-filter.tsx` HOC that wraps any page in agent-type plumbing, removing the per-page boilerplate (currently duplicated in `[slug]/page.tsx`, `me/page.tsx`, `teams/[team]/page.tsx`, plus their metric pages).

**Design questions:**

- Where's the canonical "list of agents this org's sessions actually use" surfaced? Today the filter shows all agents always. Could be data-driven: only show agents present in this org's sessions.
- When filtered to one agent, should non-applicable metrics disappear from the overview, or render as "N/A"? Today: render normally with "—". This is an interaction point with Surface E.
- Per-agent badges on session lists — do we need agent-distinct colors? Today, no badge color. With 4+ agents, color-coding starts to matter.

---

## Cross-cutting design questions

### Q1 — Where does the "agent registry" live?

Three plausible homes:
- **CLI binary**: agents are registered via Go imports; the CLI is the source of truth, server learns about new agents passively as sessions arrive.
- **Server config**: a Rails config/initializer + DB-side enum; CLI fetches at install time. Adding an agent is a server change first.
- **External shared file**: a YAML/TOML in repo root, code-generated into all three layers.

The forcing function for "agent registry on server": dashboard wants to render labels, filter UIs, capability matrices. If the server doesn't know, the dashboard has to ship-with-knowledge or fetch from a CDN. "External shared file with codegen" is the only option that gives all three layers identical knowledge without runtime fetches.

### Q2 — Is "agent" the right level of abstraction? Or should it be "(harness, model_provider, ingestion mode)"?

Today: agent_type is doing four jobs at once.
- **Harness** (the tool the user is interacting with): Claude Code / Copilot CLI / Cursor.
- **Session source** (where the data lives on disk): `~/.claude/projects/...`, `~/.copilot/session-state/`, `~/.cursor/...`.
- **Model provider** (who's billing): Anthropic, GitHub Copilot Premium Requests, Cursor (via OpenAI/Anthropic).
- **Ingestion mode** (how data gets to AX): hook + `ax push`, file polling, server-side API.

These four collapse cleanly today: "claude_code" = Claude Code harness + Anthropic provider + local-JSONL source + hook-driven push. "copilot_cli" = Copilot harness + multi-provider + local-JSONL source + hook-driven push.

Cursor breaks it: Cursor harness + multi-provider + local-multi-source + hook-OR-poll-OR-server-API ingestion.

Options:
- **Keep `agent_type` as harness ID, accept that it's underspecified.** Add separate columns for `model_provider`, `ingestion_mode` if needed. Simple but incremental.
- **Make agent_type a tuple.** `provider: { harness: "cursor", model_provider: "openai", ingestion_mode: "local_jsonl" }`. Powerful but fan-out in queries.
- **Multiple "agent_types" per harness.** `cursor_cli_local` vs `cursor_cli_admin_api` are two distinct agent_types. Scales N×M.

### Q3 — Capability matrix: shared schema or computed?

Once you have a capability matrix, you can either:
- **Share it explicitly** — push it to the dashboard at build/runtime.
- **Compute it on the fly** — for each `(agent_type, metric)` pair, run a "does any session have non-NULL data for this?" check. Slow, but always-correct.

A hybrid: declared matrix is canonical, but `/api/v1/agents/:id/capabilities` returns the matrix *and* observed-data flags so the dashboard can sanity-check.

### Q4 — Server-side data sources (Cursor Admin API, GitHub Copilot business API)

The local-file-parsing model breaks for two known cases:
- Cursor Enterprise Admin API → gets tokens that aren't local.
- (Hypothetical) Copilot Business / Enterprise admin endpoints → similar shape.

These are *server-side polled*, per-org-API-key, and per-user (not per-session). They join to local-parsed sessions by `(timestamp, user, model)`.

This isn't part of the CLI provider abstraction at all. It's a parallel "server-side ingestor" abstraction. Worth flagging now — if we design the CLI Provider interface assuming "all data flows from the user's machine," we'll regret it when Cursor Admin tokens land server-side.

### Q5 — Versioning and forward-compat

Two new questions surface:
- **Agent version ranges**: Claude Code's session JSONL schema has changed across versions; Copilot's is undocumented and could drift. Provider implementations should declare *which versions* of the agent they support (or attempt graceful degradation).
- **AX wire format versioning**: Today `PushPayload` has no version field. Adding capability declarations or a `provider` object would be a breaking schema change. Worth introducing a `payload_version` field while there's still only one wire shape.

---

## Open questions / non-blocking research items

These would be worth investigating before committing to a specific abstraction shape:

1. **Cursor `store.db` blob format.** Reverse-engineering the per-chat blob store (`~/.cursor/chats/.../store.db`) would unlock: full message tree (with IDs / reasoning), `lastUsedModel` per message, `ApplyPatch` resolution. May obviate need for per-message timestamps in transcript.
2. **Cursor `scored_commits` accuracy.** Is `v2AiPercentage` reliable? If yes, AX could ship a "% AI-authored lines" metric Cursor users get for free that Claude/Copilot users would need a different signal for (post-commit AI-detection heuristic?). Or: it's a Cursor-only signal that lives in `extras` jsonb and powers a Cursor-segment-only tile.
3. **Cursor Admin API ingestion ergonomics.** Build a throwaway "fetch tokens for last 24h, correlate by (timestamp, user)" script; see how flaky the join is in practice. If reliable, server-side ingestion is real; if fuzzy, it's a "best-effort enrichment."
4. **Codex CLI / Aider / Gemini CLI / OpenCode / Windsurf / Trae shapes.** Mentioned in `cursor.md` and the multi-tool extractor (`0xSero/ai-data-extraction`) as having "documented per-tool paths and output schema." Surveying any one of these would test whether the abstractions sketched here generalize past three.
5. **Hook event vocabulary.** Claude has `SessionEnd, Stop, PreCompact, ...`; Copilot has `sessionStart, sessionEnd, preToolUse, ...`; Cursor has 18+ events. Is there a common canonical set AX should normalize to, or does AX always just want session-end?
6. **Dashboard NULL semantics.** For the unsupported-metric case, what's the desired UX — hide tile, render "N/A", render "—" (today)? UX/PM call, but pulls on Surface E and H.
7. **Provider plugin packaging.** If providers are pluggable, do third parties write them? AX is closed today; agent diversity grows fast. A future ADR might consider a plugin API. Out of scope for the next implementation but worth knowing the interface should support it.

## Appendix — cross-agent shape comparison cheat sheet

A condensed lookup for when this doc gets re-read:

| Concern | Claude Code | Copilot CLI | Cursor CLI |
|---|---|---|---|
| Root dir | `~/.claude/` | `~/.copilot/` | `~/.cursor/` |
| Sessions | `~/.claude/projects/<encoded-path>/<uuid>.jsonl` (+ subagent dirs) | `~/.copilot/session-state/<uuid>/events.jsonl` | `~/.cursor/projects/<encoded-path>/agent-transcripts/<uuid>/<uuid>.jsonl` |
| Path encoding | `/` and `.` → `-` (`-Users-foo-bar`) | N/A — flat UUID dirs | `/` → `-`, leading `/` stripped (`Users-foo-bar`) |
| Format | flat JSONL, message-shaped | flat JSONL, event-shaped | flat JSONL, message-shaped (Claude-like) |
| Per-msg timestamps | `timestamp` field | `timestamp` field | embedded in user text only |
| Per-msg ID / parent | `uuid` / `parentUuid` | `id` / `parentId` | none |
| Tokens per turn | `message.usage.{input,output,cache_*}_tokens` | `assistant.message.outputTokens` (output only) | not available |
| Tokens aggregate | sum per-turn | `session.shutdown.modelMetrics[m].usage` | not available locally |
| Repo identity | derive via `git remote` | `workspace.yaml:repository` (`owner/repo`) | derive via `git remote` (only `cwd` is local) |
| Tool: read | `Read`, `Glob` | `view`, `read_file` | `ReadFile`, `Glob` |
| Tool: modify | `Edit`, `Write` | `edit`, `create`, `edit_file`, `create_file` | `ApplyPatch` (unified) |
| Tool: shell | `Bash` | `bash`, `shell`, `run_command` | `Shell` |
| Tool: subagent | `Agent` | `task` | none observed |
| MCP detection | `mcp__` prefix | `mcp__` or `mcp.` prefix | TBD |
| Tool result captured? | yes (`tool_result` blocks in user msgs) | yes (`tool.execution_complete.data.result`) | **no** (excluded by design) |
| Worktree convention | `~/.claude/worktrees/<name>` (managed) | none — ordinary git worktrees | none — ordinary git worktrees |
| Hook scope | user (`~/.claude/settings.json`) | repo (`<repo>/.github/hooks/*.json`) | both (`~/.cursor/hooks.json` + `<repo>/.cursor/hooks.json`) |
| Hook event for "session ended" | `SessionEnd` | `sessionEnd` | `sessionEnd` (CLI: docs say yes Jan 2026, forum reports flaky) |
| AGENTS.md / CLAUDE.md | reads `CLAUDE.md` | reads `AGENTS.md` + `CLAUDE.md` + `GEMINI.md` | reads `AGENTS.md` (and `.cursorrules` legacy) |
| Skills convention | `~/.claude/skills/` | `~/.copilot/skills/` + reads `~/.claude/skills/` + `~/.agents/skills/` | `~/.cursor/skills-cursor/` |
| Per-commit AI attribution | not exposed | not exposed | `ai-tracking/ai-code-tracking.db:scored_commits` |
| Conversation summary | not exposed | not exposed | `ai-tracking/ai-code-tracking.db:conversation_summaries` |
| Source open? | no | no | no |
