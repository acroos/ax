# Plan: Support Multiple Coding Harnesses and Model Providers

## Context

AX is currently hard-coupled to **Claude Code** (the harness that produces session data) and **Anthropic Claude** (the model provider whose token pricing drives cost metrics). This plan scopes what it would take to support at least two additional harnesses (Cursor, GitHub Copilot CLI) and two additional model providers (OpenAI, Google Gemini), plus GitHub's Copilot coding agent as a webhook-only special case.

This is scoping work — no code changes are made here. Specific implementation ADRs will follow for any individual harness/provider we commit to.

### Why now

Customers use more than one agentic tool. A team measuring DX for "agentic coding" that can only read Claude Code data gives a systematically incomplete picture. Each new harness and provider adds marginal user coverage; the coupling we have today blocks all of them simultaneously.

### What this plan covers

- A complete inventory of current Claude Code / Anthropic coupling, with file paths and line numbers
- Per-harness integration profiles and verdicts (parseable / parseable-with-effort / opaque)
- Per-provider pricing and token-taxonomy differences
- A harness-agnostic session schema
- A phased roadmap, with the hard parts called out
- Open decisions that need stakeholder input

### What this plan does NOT cover

- Final UI designs for multi-harness dashboards
- Final pricing schema (an ADR will follow)
- Implementation code
- Any promises about what customers we will support first

---

## Current coupling inventory

### Claude Code coupling

| Layer | File | Lines | Coupling | Severity |
|---|---|---|---|---|
| CLI discovery | `cli/cmd/ax/main.go` | 239, 330 | Hardcoded `~/.claude` path | High |
| Session parser | `cli/internal/parsers/claude_sessions.go` | 151-185 | Directory encoding scheme (`/`→`-`) | High |
| Session parser | `cli/internal/parsers/claude_sessions.go` | 58-86, 200-302 | JSONL schema: `parent_uuid`, `sidechain`, Anthropic token fields | Critical |
| Session parser | `cli/internal/parsers/claude_sessions.go` | 364-396 | Tool-name expectations (`Bash`, `Read`, `Edit`, `Write`, `Glob`) | High |
| Worktree detect | `cli/internal/bulk/discovery.go` | 140-149 | Marker `/.claude/worktrees/` | High |
| Hooks install | `cli/internal/hooks/hooks.go` | 238-242 | Hardcoded `~/.claude/settings.json` | High |
| Hooks install | `cli/internal/hooks/hooks.go` | 45-46 | Events `SessionEnd`, `Stop` | High |
| Push payload | `cli/internal/api/types.go` | 54-73 | `SessionData` struct shaped around Claude Code | High |
| Push ingest | `server/app/services/push_service.rb` | 105-131 | Session upsert assumes Claude field set | High |
| DB schema | `server/db/schema.rb` | 224-247 | `sessions` table: no `harness_type` / `model_provider`; Anthropic-only columns | High |
| Metrics | `server/app/services/metrics_computer.rb` | 58-94 | `cache_hit_rate`, `sidechain_rate`, `re_read_rate` rely on Claude-shaped fields | Critical |

### Anthropic / Claude model coupling

| Layer | File | Lines | Coupling |
|---|---|---|---|
| Pricing table | `cli/internal/pricing/pricing.go` | 22-39 | Hardcoded Anthropic models only |
| Pricing lookup | `cli/internal/pricing/pricing.go` | 48-73 | Family-match fallback (opus / haiku / default Sonnet) |
| Pricing struct | `cli/internal/pricing/pricing.go` | 12-18 | `ModelPricing` assumes Anthropic cache-creation/cache-read billing |
| Model storage | `server/db/schema.rb` | 237 | Raw string `primary_model`, no provider field |

**Impact of pricing fallback bug today**: Unknown models silently fall back to Sonnet pricing. If a non-Claude model somehow slips through (unlikely with only Claude Code today, but guaranteed to happen once we accept multi-model harnesses), cost metrics will be wrong by ~25% for OpenAI and ~75% for Gemini.

---

## Harness integration profiles

### Claude Code (baseline)

- Session storage: `~/.claude/projects/<encoded-path>/*.jsonl` + managed worktree tree at `~/.claude/worktrees/`
- Hooks: `~/.claude/settings.json` (user-level) — `SessionEnd`, `Stop`, `PreToolUse`, `PostToolUse`, etc.
- Format: JSONL, per-turn, with `usage.input_tokens`, `usage.output_tokens`, `usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens`, `message.model`
- Verdict: **parseable** — this is what AX already does

### Cursor

Three viable surfaces, in preference order:

1. **Cursor hooks** (primary integration surface)
   - Config: `~/.cursor/hooks.json` (user-level) and `.cursor/hooks.json` (repo)
   - Events: `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `afterFileEdit`, `stop`, `afterAgentResponse`, `preCompact`, and more
   - Every payload carries `conversation_id`, `generation_id`, `model`, `transcript_path` (a real JSONL file containing user + assistant messages + tool call inputs)
   - Docs explicitly call out Claude Code compatibility: [cursor.com/docs/hooks](https://cursor.com/docs/hooks)
   - **Live caveat**: As of Jan 2026, `sessionEnd` / `stop` / `beforeSubmitPrompt` are IDE-only and don't fire in the CLI. The [Jan 16 2026 CLI changelog](https://cursor.com/changelog/cli-jan-16-2026) claims the gap is closing. Verify empirically at implementation time; fall back to `afterAgentResponse` or polling if needed.

2. **Cursor CLI `agent` headless output**
   - `agent -p --output-format stream-json` emits NDJSON: system init, user messages, assistant messages, tool calls + results, final result with `session_id` + `duration_ms`
   - Useful for CI invocations where hooks aren't installed

3. **IDE SQLite DB fallback**
   - `~/Library/Application Support/Cursor/User/{globalStorage,workspaceStorage}/state.vscdb`
   - Undocumented schema, multiple format migrations (`aichat` → `composer` → `cursorDiskKV`)
   - Prior art: [0xSero/ai-data-extraction](https://github.com/0xSero/ai-data-extraction) handles this across versions
   - Only needed for users who haven't installed hooks

- **Tokens/cost**: Not exposed anywhere locally. Only available via Cursor's Enterprise Admin API (`/teams/filtered-usage-events`) — per-request, not session-scoped, no `session_id` on events.
- Verdict: **parseable** (session data), **opaque for token/cost** without Enterprise API access

### GitHub Copilot CLI (`@github/copilot`)

Architecturally a close cousin to Claude Code:

- Install: `npm install -g @github/copilot`
- Session storage: `~/.copilot/session-state/` (JSONL) + `~/.copilot/session-store.db` (SQLite index)
- Hooks: `.github/hooks/*.json` — events `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred`
- Hook payload: stdin JSON with `timestamp`, `cwd`, `transcriptPath`, event-specific fields
- Multi-model: switches Anthropic / OpenAI / Google via `/model` slash command mid-session
- Reads `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `~/.claude/skills/` natively

Two meaningful differences from Claude Code:

- **Hook install location is repo-level only** (`.github/hooks/`). No documented user-level equivalent. We'd install hooks per-repo on `ax init`, or commit a shared hook file.
- **Tokens/cost exposure is unclear**. Billing is "premium requests" (1× per prompt, model-agnostic). The chronicle doc mentions prompts, responses, tool uses, and modified files — not tokens. `/context` shows live token usage but persistence is undocumented. Empirical inspection of a real session JSONL is needed before committing to cost metrics for Copilot CLI sessions.

Verdict: **parseable** (session data), **token/cost TBD pending empirical verification**

### Copilot coding agent (webhooks only)

- Runs server-side on GitHub infra; opens PRs as `copilot-swe-agent` bot
- No local data; integrate purely via existing GitHub webhook pipeline (ADR-010, ADR-013)
- Detect via `pull_request.user.login == 'copilot-swe-agent'` (verify the exact account/app ID at implementation time)
- Tag PRs `harness_type: copilot-agent`, `session_data_available: false`
- Only the four GitHub-sourced metrics apply
- Verdict: **parseable** (GitHub data only), **cheapest harness to support by far**

### Aider

- CLI tool, plaintext chat history in Markdown under per-project `.aider.chat.history.md` (and friends) or user home
- No standard hook system; integration would need shell alias / wrapper script
- Token data: Aider makes API calls directly to Anthropic / OpenAI / etc.; tokens are in API responses but persistence to disk depends on Aider's configuration and version
- Branch tracking: available via git
- Verdict: **parseable-with-effort** — parsing is tractable but hook install is clunkier than Cursor or Copilot CLI

### Copilot IDE (inline suggestions + Copilot Chat panel)

- No local session data in any stable, documented format
- No hooks
- Aggregate usage available only via GitHub's [Copilot Metrics API](https://docs.github.com/rest/copilot/copilot-metrics) at the org/enterprise level (daily aggregates, no PR correlation)
- Verdict: **opaque for per-PR integration**; separately viable as an "org overview" surface if we want it

---

## Model provider profiles

### Anthropic (baseline)

- Token types: input, output, cache creation, cache read (all tracked per-response)
- Pricing: explicit per-million rates for each type; cache creation is typically 1.25× the cache read rate
- Model IDs: `claude-opus-4-6`, `claude-sonnet-4-6`, etc.

### OpenAI

- Token types: input, output, cache creation (since late 2024), cache read
- Pricing: cache creation billed at 50% of input rate; cache read at 10% of input rate (different calculation than Anthropic's explicit-per-million)
- Model IDs: `gpt-4-turbo`, `gpt-4o`, `gpt-4.1`, etc. (drifts; we need the registry approach below)

### Google Gemini

- Token types: input, output. **Cache is not tracked per-token.** Cached system prompts are billed at 10% of the input rate.
- Requires a different cache-cost computation shape than Anthropic / OpenAI
- Model IDs: `gemini-1.5-pro`, `gemini-1.5-flash`, etc.

### Implication

The existing `ModelPricing` struct (`InputPerMTok`, `OutputPerMTok`, `CacheReadPerMTok`, `CacheCreationPerMTok`) doesn't generalize. We need a provider-pluggable pricing interface with per-provider `CacheStrategy`.

---

## Proposed architecture

### Normalized session schema

Introduce a harness-agnostic `NormalizedSession` type produced by harness-specific parsers and consumed by the push client:

```
NormalizedSession {
  id            string          // harness-local session identifier
  harness_type  string          // "claude-code" | "cursor" | "copilot-cli" | "copilot-agent" | "aider"
  provider      string          // "anthropic" | "openai" | "gemini" | null if unknown
  model_id_raw  string          // provider's raw model string
  branch        string
  started_at    int64 (ms)
  ended_at      int64 (ms)

  // Generic message counts
  human_messages      int
  assistant_messages  int
  turns               int

  // Token counts (provider-specific; nullable)
  tokens TokenCounts {
    input, output                         int
    cache_creation, cache_read            int
    provider_specific                     map[string]int
  }

  // Tool usage (generic)
  tool_usage map[string]int  // e.g., {"Bash": 4, "Edit": 11}

  // Files touched
  files_read     []string
  files_modified []string

  // Harness-specific metrics preserved for later
  extras map[string]any  // e.g., sidechain_messages for Claude Code only
}
```

### Parser registry

Each harness implements:

```
SessionParser {
  Name() string
  CanParse(path string) bool
  DiscoverSessions(projectPath string) ([]string, error)
  Parse(path string) (*NormalizedSession, error)
  Version() string
}
```

Implementations:

- `ClaudeCodeParser` (move current logic into this)
- `CursorHookTranscriptParser` (reads the JSONL at `transcript_path` from the hook payload)
- `CursorCLIOutputParser` (stream-json mode)
- `CursorSqliteFallbackParser` (optional, later)
- `CopilotCLIParser` (reads `~/.copilot/session-state/` or the `transcriptPath` from hook payload)
- `AiderParser` (reads chat history files)

### Pricing provider registry

```
ModelProvider {
  Name() string
  GetPricing(model_id string) *ModelPrice
  ComputeCost(tokens TokenCounts, model_id string) float64
}
```

Implementations: `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`. Each encapsulates that provider's cache semantics. Pricing tables move from hardcoded maps into a DB-backed table with effective dates so we can recompute historical costs when prices change.

### Hook registry

Per-harness hook installers under a shared interface:

```
HarnessHook {
  Install(axBinary string, scope: "user" | "repo", repoPath string) error
  Uninstall(scope, repoPath string) error
  IsInstalled(scope, repoPath string) bool
}
```

- Claude Code: user-level at `~/.claude/settings.json` (existing code)
- Cursor: user-level at `~/.cursor/hooks.json`
- Copilot CLI: repo-level at `.github/hooks/ax-session-end.json` (no user-level option today)
- Aider: shell-alias wrapper in `~/.ax/hooks/aider-wrapper.sh` + shell-rc modification

### Schema changes

```sql
ALTER TABLE sessions ADD COLUMN harness_type TEXT;
ALTER TABLE sessions ADD COLUMN harness_version TEXT;
ALTER TABLE sessions ADD COLUMN model_provider TEXT;
ALTER TABLE sessions ADD COLUMN session_data_available BOOLEAN DEFAULT TRUE;
ALTER TABLE sessions ADD COLUMN extras JSONB;

-- Backfill existing rows
UPDATE sessions SET harness_type = 'claude-code', model_provider = 'anthropic' WHERE harness_type IS NULL;

-- Composite uniqueness across harnesses
ALTER TABLE sessions DROP CONSTRAINT sessions_pkey;
ALTER TABLE sessions ADD PRIMARY KEY (id, harness_type, repo_id);

-- New: pricing tables
CREATE TABLE model_providers ( ... );
CREATE TABLE provider_model_pricing (
  id, provider_id, model_identifier,
  input_per_mtok, output_per_mtok,
  cache_strategy ENUM('anthropic', 'openai', 'gemini'),
  cache_param_1, cache_param_2,
  effective_from, effective_to
);
```

Keep the existing Anthropic-specific columns (`cache_creation_input_tokens`, `cache_read_input_tokens`, `sidechain_messages`) for now — they're useful for Claude Code sessions and harmless (null/0) for others. Revisit when we have enough non-Claude sessions to decide whether to migrate them into `extras`.

---

## Metric viability matrix

| Metric | Claude Code | Cursor | Copilot CLI | Copilot agent | Aider |
|---|---|---|---|---|---|
| Post-Open Commits | ✓ | ✓ | ✓ | ✓ | ✓ |
| CI Success Rate | ✓ | ✓ | ✓ | ✓ | ✓ |
| Line Revisit Rate | ✓ | ✓ | ✓ | ✓ | ✓ |
| Review Cycle Time | ✓ | ✓ | ✓ | ✓ | ✓ |
| Iteration Depth | ✓ | ✓ | ✓ | ✗ | ⚠ |
| Token Cost per PR | ✓ | ✗ | ? empirical | ✗ | ✓ if tokens logged |
| Cache Hit Rate | ✓ | ✗ | ? empirical | ✗ | ~ provider-dependent |
| Sidechain Rate | ✓ | ✗ | ✗ | ✗ | ✗ |
| Re-Read Rate | ✓ | ✓ | ✓ likely | ✗ | ~ |
| Autonomy Score | ✓ | ✓ | ✓ | 1.0 trivially | ⚠ |

Realities to carry forward:

- The four GitHub-sourced metrics are universal.
- **Sidechain Rate is Claude-only.** It needs either retirement, a harness-agnostic replacement, or a clearly-documented "Claude Code only" marker in the dashboard.
- **Token Cost per PR is at risk for Cursor and Copilot CLI.** Cursor definitively can't supply it without Enterprise API access. Copilot CLI is TBD until we inspect real session data.
- **Autonomy Score for Copilot agent is trivially 1.0.** Either exclude the agent from this metric or redefine it.

---

## Phased roadmap

### Phase 0 — Empirical verification (pre-work)

No production code. Goal: close research gaps that gate design decisions.

- Install Copilot CLI, run a session, inspect `~/.copilot/session-state/` — confirm JSONL schema, whether tokens + model are persisted per-turn, whether `transcriptPath` is reliable on `sessionEnd`
- Install Cursor, run a session with hooks installed, inspect `transcript_path` JSONL — confirm schema and which events reliably fire in CLI vs IDE
- Inspect Aider chat-history format across versions; confirm whether token counts are ever persisted locally
- Confirm `copilot-swe-agent` bot identity (exact `user.login` / `node_id`) from a real coding-agent PR

Output: a short empirical appendix to this doc plus a go/no-go on the cost-metric story per harness.

### Phase 1 — Foundation (behavior-preserving)

Zero user-visible change. All existing Claude Code flows continue to work.

1. Extract `ClaudeCodeParser` to implement a new `SessionParser` interface; wire the existing CLI entry points through a registry
2. Introduce `NormalizedSession` as an internal type; map both directions to the existing `SessionData` wire format
3. Pricing: introduce `ModelProvider` interface; keep the Anthropic implementation with current hardcoded rates; add the provider interface without breaking current callers
4. Schema migration: add `harness_type`, `harness_version`, `model_provider`, `session_data_available`, `extras` columns; backfill existing rows
5. `PushService`: accept new fields; default missing values to Claude Code / Anthropic
6. Composite uniqueness on `sessions`

Exit criteria: all existing tests pass, no dashboard changes, production Claude Code ingestion indistinguishable from today.

### Phase 2 — Cheap wins

The two highest-ROI, lowest-risk additions:

1. **Copilot coding agent (webhook-only)**
   - Detect `copilot-swe-agent`-authored PRs in the existing webhook handler
   - Tag as `harness_type: copilot-agent`, `session_data_available: false`
   - Compute only the four GitHub-sourced metrics; flag the other six as N/A in the API response
2. **OpenAI provider**
   - Implement `OpenAIProvider` with `OpenAICacheStrategy` (50% cache creation, 10% cache read)
   - DB-backed pricing table with effective dates; migrate Anthropic rates into it

Exit criteria: at least one Copilot-agent PR tagged correctly in prod; OpenAI pricing computable via the new interface (no harness ingests OpenAI tokens yet).

### Phase 3 — Second real harness

Pick based on Phase 0 findings; current best guess:

**Cursor via hooks** — official hook system, user-level install, direct transcript JSONL. Closer to Claude Code than any other option.

- `CursorHookTranscriptParser` for the `transcript_path` JSONL
- `ax init --harness cursor` writes `~/.cursor/hooks.json`
- Dashboard: handle `session_data_available: true` but tokens absent — show N/A for Token Cost and Cache Hit Rate on Cursor sessions
- Document the cost-metric gap honestly per ADR-006 ("honest about ambiguity")

Exit criteria: Cursor sessions push successfully, 7 of 10 metrics populated, 3 clearly marked N/A.

### Phase 4 — Copilot CLI + Gemini

- `CopilotCLIParser` for `~/.copilot/session-state/*.jsonl`
- `ax init --harness copilot-cli` — writes `.github/hooks/ax-session-end.json` into the target repo (repo-level install UX)
- `GeminiProvider` + `GeminiCacheStrategy` (10% of input rate, no per-token cache)
- Decide on cost-metric approach for Copilot CLI based on Phase 0 empirical findings

Exit criteria: Copilot CLI ingestion works; Gemini-produced sessions (from any multi-model harness) price correctly.

### Phase 5 — Dashboard UX + Aider

- Harness/provider badges on PR cards
- Harness filter on the main dashboard
- Cost breakdown by provider on PR detail view
- Per-metric N/A rendering with inline tooltip explanation
- Aider support as third harness (if customer demand justifies the parser complexity)

### Phase 6 — Enterprise-tier cost telemetry (optional, later)

For customers who want cost metrics on Cursor / Copilot CLI sessions where they're not in local data:

- Cursor Admin API integration (`/teams/filtered-usage-events`) — correlate by user + timestamp + model
- Copilot Metrics API as a separate "org overview" surface — aggregate only, not PR-correlated
- Gated on tier/pricing; treat as an add-on, not a core feature

---

## Cross-cutting concerns

### Session deduplication

Different harnesses may emit colliding session IDs (UUIDs, content hashes, timestamps). Composite primary key `(id, harness_type, repo_id)` handles this cleanly.

### Multi-harness PR attribution

A PR may have sessions from multiple harnesses (e.g., developer uses Claude Code for planning, Cursor for edits). The correlation service (`session_pr_correlation_service.rb`) already works harness-agnostically via branch + time overlap — no change needed there.

But **metrics aggregation across harnesses needs care**. Proposed approach: group sessions by `(harness_type, model_provider)` before computing harness-dependent metrics, and present per-harness breakdowns rather than single blended numbers where the metric doesn't aggregate cleanly.

### Metric-N/A UX contract

When a harness can't supply a metric, the API should return `{ value: null, reason: "not_supported_by_harness", harness: "cursor" }` rather than `0` or `null` without context. Dashboard renders "N/A" with a tooltip explaining which harness is missing the data. This protects us from silently reporting bogus zeros.

### Pricing version + recomputation

Store raw tokens + `model_provider` + `model_id_raw` on every session. Compute cost on ingest *and* keep the ability to recompute. When pricing tables update, run a background job to recompute `total_cost_usd` for affected sessions within a configurable window. Historical reports remain stable via effective-dated pricing rows.

### Dashboard language cleanup

"Claude Code" appears in marketing copy, setup page, and docs. Change to "AX supports Claude Code, Cursor, Copilot CLI, ..." after Phase 3 ships. Setup page needs per-harness install tabs.

---

## Open decisions

These need stakeholder input before committing to implementation:

1. **Sidechain Rate**: retire, redefine harness-agnostically, or mark Claude-Code-only?
2. **Token Cost per PR on harnesses that don't expose tokens**: drop the metric for those harnesses, offer an Enterprise Admin API path, or show estimated costs based on message content length + known pricing?
3. **Copilot CLI hook install**: commit `.github/hooks/ax-session-end.json` to each repo (visible, shared), gitignore it (per-dev, fragile), or wait for GitHub to ship user-level hooks? Lean: commit it, document why.
4. **Ordering of Phase 3 vs Phase 4**: is Cursor or Copilot CLI the higher priority? Customer demand should drive this.
5. **Aider priority**: is it worth the parser complexity given Cursor + Copilot CLI likely cover more users? Possible defer indefinitely.
6. **Autonomy Score for Copilot agent**: exclude (N/A), or redefine as "fraction of agent-authored commits that ship without human follow-up commits"?
7. **Per-harness setup guides**: treated as a doc deliverable per harness, or build a generic multi-harness setup flow?
8. **`session_data_available` flag**: do we let the dashboard filter on this (show/hide harnesses without session data), or always include them with clear N/A badging?

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Copilot CLI doesn't persist tokens per-turn | Medium | High — breaks cost metrics for one harness | Phase 0 empirical check; fall back to "premium request count" as alternate metric |
| Cursor hook `sessionEnd` stays CLI-broken | Low | Medium — forces polling fallback | Monitor changelog; use `afterAgentResponse` if needed |
| Claude Code session schema drift while we refactor | Low | Medium — existing ingestion regression | Keep Phase 1 strictly behavior-preserving with full test coverage before any new harness lands |
| Pricing table staleness across providers | Medium | Low — cost accuracy drifts | Effective-dated pricing rows + scheduled recomputation |
| Cursor IDE SQLite schema migration mid-rollout | Low | Medium — fallback parser breaks | Fallback is Phase 5 / optional; hook-based path is primary |
| Subscription-billed tools (Copilot) conflate "cost" meaning | Medium | Low-Medium — customer confusion | Documentation + dashboard N/A badging; document per-ADR per provider |

---

## Estimated scope

Not time estimates — relative sizing to help plan sequencing:

- Phase 0 (empirical): small
- Phase 1 (foundation): large
- Phase 2 (Copilot agent + OpenAI provider): medium
- Phase 3 (Cursor): medium
- Phase 4 (Copilot CLI + Gemini): medium
- Phase 5 (dashboard UX + Aider): large
- Phase 6 (Enterprise APIs): medium-large, optional

Foundation work (Phase 1) is the bulk of the architectural cost. Each additional harness / provider after that is incremental.

---

## Related decisions

- ADR-005 — Session Ingestion Strategy (Claude Code hooks)
- ADR-009 — Token Cost Metrics (current pricing model)
- ADR-010 — GitHub Event Ingestion (webhook pipeline for Copilot agent)
- ADR-013 — GitHub Integration Model (OAuth + GitHub App)
- ADR-015 — Design System and shadcn/ui (dashboard UX)

New ADRs that will follow if we commit to implementation:

- ADR-0XX — Multi-harness session schema
- ADR-0XX — Provider-pluggable pricing
- ADR-0XX — Metric viability contract (per-harness N/A semantics)
