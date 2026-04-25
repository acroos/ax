# Plan: Copilot CLI Session Support

## Context

AX currently parses Claude Code session data only. Adding Copilot CLI support lets teams using GitHub Copilot CLI (or both tools) get the same DX metrics. Research confirmed that 12/15 metrics are fully feasible from Copilot's `events.jsonl` format. As part of this work, we're also switching from dollar-based cost to token-based cost (simpler, universal across providers).

## Approach

Three phases, each a separate PR. Phase 1 is a prerequisite that simplifies the schema. Phase 2 is the core Copilot work. Phase 3 is dashboard polish.

---

## Phase 1: Drop dollar cost, switch to token-based metric

Replace `total_cost_usd` (dollar amount computed from model-specific pricing) with `input_tokens + output_tokens` (raw token count). Tokens are the universal unit across providers.

### CLI

- `cli/internal/parsers/claude_sessions.go`
  - Remove `TotalCostUSD` field from `ParsedSession` (line 42)
  - Remove `pricing.ComputeCost()` accumulation in `parseSessionFile()` (lines 496-500)
  - Remove `TotalCostUSD` assignment in `ToSessionData()` (line 86)
  - Keep `pricing.LookupMaxContext()` — still needed for `PeakContextPct`

- `cli/internal/api/types.go`
  - Remove `TotalCostUSD float64` from `SessionData` (line 32)

- `cli/internal/metrics/metrics.go`
  - Delete `TokenCostForSessions()` (unused function)

- Tests: Update any test fixtures that set `TotalCostUSD`

### Server

- **Migration**: Drop `total_cost_usd` column from `sessions` table
- `server/app/services/push_service.rb`
  - Remove from `SESSION_UPDATE_COLUMNS` (line 154)
  - Remove from row mapping (line 191)
- `server/app/services/metrics_aggregator.rb`
  - Change `"token-cost-per-pr"` expression from `"total_cost_usd"` to `"input_tokens + output_tokens"` (line 30)
- `server/app/controllers/concerns/session_serialization.rb`
  - Change SELECT alias from `sessions.total_cost_usd AS token_cost_usd` to `(sessions.input_tokens + sessions.output_tokens) AS token_cost_usd` (line 16)
  - Or rename the alias to `total_tokens` and update `serialize_session` accordingly
- `server/app/controllers/api/v1/prs_controller.rb`
  - Change SUM aggregation (line 56) to sum `input_tokens + output_tokens`
- `server/app/controllers/api/v1/push_controller.rb`
  - Remove `total_cost_usd` from permitted params (line 32)
- `server/app/services/personal_data_export_service.rb`
  - Remove `total_cost_usd` from export (line 76)

### Dashboard

- `dashboard/src/lib/metric-defs.ts`
  - Change `token-cost-per-pr`: `valueType` from `"currency"` to `"integer"`, remove `unit: "$"`, update label/tooltip to reference tokens
- `dashboard/src/components/metric-card.tsx`
  - Remove or repurpose `fmtCost()` function (line 21-24)
- `dashboard/src/components/paginated-pr-table.tsx`
  - Change cost column display from `$X.XX` to token count with abbreviation (lines 70-73)
- `dashboard/src/components/pr-table-header.tsx`
  - Rename "Cost" header to "Tokens" (line 33-35)
- `dashboard/src/app/(app)/prs/[id]/page.tsx`
  - Update token cost display (lines 115-123)
- `dashboard/src/lib/metric-utils.ts`
  - Update distribution bucketing for `$` unit (lines 232-233)
- `dashboard/src/lib/mock/data.ts`
  - Update mock data generators
- `dashboard/src/lib/db.ts`
  - Rename `token_cost_usd` field in `SessionMetrics` interface, `timelineDataFromPrs`, etc.

### Docs

- Amend ADR-009: Tokens replace dollars as cost unit
- Update `docs/metrics/token-cost-per-pr.md`
- Update `wiki/metrics.md`
- Update demo app to match

---

## Phase 2: Copilot CLI parser + agent_type

### Server: agent_type migration

- Add `agent_type` column: `string, NOT NULL, default: 'claude_code'`
- Add index on `(repo_id, agent_type)` for filtered queries
- `server/app/services/push_service.rb`: Accept and store `agent_type` in upsert
- `server/app/controllers/api/v1/push_controller.rb`: Permit `agent_type` param
- `server/app/controllers/concerns/session_serialization.rb`: Include `agent_type` in API response

### CLI: Add agent_type to SessionData

- `cli/internal/api/types.go`: Add `AgentType string` field (`json:"agent_type"`)
- `cli/internal/parsers/claude_sessions.go`: Set `AgentType: "claude_code"` in `ToSessionData()`

### CLI: Copilot parser (new file)

- **New file**: `cli/internal/parsers/copilot_sessions.go`
- **Struct**: Reuse `ParsedSession` — same output type as Claude parser
- **Parse logic**: Read `events.jsonl` line by line, switch on `type` field:
  - `session.start` → `ID`, `Branch`, `StartedAt`, cwd/repo metadata
  - `session.model_change` → track model for majority vote
  - `user.message` → increment `HumanMessages`
  - `assistant.message` → increment `AssistantMessages`, accumulate `OutputTokens`, count tool requests
  - `assistant.turn_start` → increment `TurnCount`
  - `tool.execution_start` → increment tool counters, track file paths by tool name:
    - `view` → file read
    - `edit`, `create` → file modify
    - `task` → agent tool call
    - `bash` → shell command (extract PR URLs/commit SHAs from results)
  - `session.shutdown` → extract aggregate tokens from `modelMetrics` (input, output, cache read/write), set `EndedAt`
  - Last event timestamp → fallback `EndedAt` if no shutdown event
- **`ToSessionData()`**: Set `AgentType: "copilot_cli"`, `SidechainMessages: 0`
- **Peak context**: Use `session.shutdown.currentTokens / model_max_context` as approximation, or set to 0 for MVP

### CLI: Copilot session discovery

- **New file**: `cli/internal/parsers/copilot_discovery.go`
- `FindCopilotSessionsForRepo(ownerRepo string)`:
  1. Glob `~/.copilot/session-state/*/workspace.yaml`
  2. Parse YAML, filter where `repository` matches target `owner/repo`
  3. Check `events.jsonl` exists (skip IDE-only sessions)
  4. Return list of session directory paths
- `CopilotSessionIDFromPath(path)`: Extract UUID from directory name

### CLI: Integrate into bulk discovery

- `cli/internal/bulk/discovery.go`:
  - After Claude Code discovery, call `FindCopilotSessionsForRepo()` for each discovered repo
  - Also discover repos that have ONLY Copilot sessions (scan all workspace.yaml files, group by repo)
  - Merge into `DiscoveredRepo.SessionFiles`
  - State tracking (`~/.ax/state/`) works as-is — session IDs are UUIDs, won't collide

### CLI: Copilot hook installation (`ax init`)

- **New file**: `cli/internal/hooks/copilot_hooks.go`
- `ax init` gains Copilot awareness:
  1. Install Claude Code global hook (as today, in `~/.claude/settings.json`)
  2. Detect if Copilot CLI is present (check `~/.copilot/` exists)
  3. If yes, install `.github/hooks/session-end.json` in the current repo's working directory:
     ```json
     {
       "version": 1,
       "hooks": {
         "sessionEnd": [
           {
             "type": "command",
             "bash": "ax push --repo .",
             "timeoutSec": 30
           }
         ]
       }
     }
     ```
  4. Print clear message: "Created .github/hooks/session-end.json — commit this file so your team gets automatic Copilot CLI session collection."
- `ax init --uninstall`: Also removes `.github/hooks/session-end.json` if it's an AX-managed hook
- **Does NOT auto-commit**. The file sits in working directory until the user decides to commit. This is deliberate — committing is a team decision.
- **Hook behavior**: When any Copilot CLI session ends in this repo, `ax push --repo .` runs. It discovers both Copilot AND Claude Code sessions. A team member who never ran `ax init` still gets automatic pushing if the hook file was committed by someone else — they just need `ax` CLI installed.
- **Docs**: Setup guide (`docs/setup.md`) updated with Copilot CLI section explaining: (1) run `ax init` in your repo, (2) commit `.github/hooks/session-end.json`, (3) ensure teammates have `ax` installed via Homebrew

### CLI: Single-repo push

- `ax push --repo .`: After parsing Claude Code sessions, also parse Copilot sessions for same repo
- Need to resolve repo identity from `git remote get-url origin` (existing) and match against Copilot's `workspace.yaml:repository`

### Tests

- Unit tests for Copilot parser with sample events.jsonl fixtures
- Unit tests for Copilot session discovery with mock filesystem
- Integration test: parse real session data from research (sanitized)

---

## Phase 3: Dashboard agent-type awareness

### API layer

- `dashboard/src/lib/db.ts`: Add `agent_type` to `SessionWithMetrics` interface
- Metric/session API calls: Add optional `agent_type` query param

### Server: Filtering

- `MetricsAggregator`: Accept optional `agent_type` filter, add WHERE clause to session queries
- Session list endpoints: Accept `agent_type` param
- Metric detail endpoints: Accept `agent_type` param

### Dashboard components

- New `AgentTypeFilter` component (similar pattern to `RepoFilter`)
  - URL param: `?agent_type=claude_code|copilot_cli` (omit = all)
  - Preserve param in scope/range changes
- Agent type badge on session list items (reuse `StateBadge` tone system)
- N/A metrics: Render as "—" when value is NULL (already handled by existing `?? "—"` patterns)

---

## Files Summary

### Phase 1 (dollar cost removal)
| File | Change |
|------|--------|
| `cli/internal/parsers/claude_sessions.go` | Remove TotalCostUSD, pricing.ComputeCost call |
| `cli/internal/api/types.go` | Remove TotalCostUSD field |
| `cli/internal/metrics/metrics.go` | Delete TokenCostForSessions |
| `server/db/migrate/YYYYMMDD_drop_total_cost_usd.rb` | New migration |
| `server/app/services/push_service.rb` | Remove cost from upsert |
| `server/app/services/metrics_aggregator.rb` | Change expression to token sum |
| `server/app/controllers/concerns/session_serialization.rb` | Change SELECT alias |
| `server/app/controllers/api/v1/prs_controller.rb` | Change SUM |
| `server/app/controllers/api/v1/push_controller.rb` | Remove from params |
| `server/app/services/personal_data_export_service.rb` | Remove cost from export |
| `dashboard/src/lib/metric-defs.ts` | Change valueType, label, tooltip |
| `dashboard/src/lib/db.ts` | Rename field |
| `dashboard/src/components/paginated-pr-table.tsx` | Update display |
| `dashboard/src/components/pr-table-header.tsx` | Rename column |
| `dashboard/src/app/(app)/prs/[id]/page.tsx` | Update display |
| `dashboard/src/components/metric-card.tsx` | Remove fmtCost |
| `dashboard/src/lib/mock/data.ts` | Update generators |
| `docs/metrics/token-cost-per-pr.md` | Rewrite for tokens |
| `docs/decisions/009-token-cost-metrics.md` | Amend |
| `wiki/metrics.md` | Update |
| Demo app mirrors | Match real app changes |

### Phase 2 (Copilot parser + agent_type)
| File | Change |
|------|--------|
| `server/db/migrate/YYYYMMDD_add_agent_type.rb` | New migration |
| `server/app/services/push_service.rb` | Accept agent_type |
| `server/app/controllers/api/v1/push_controller.rb` | Permit agent_type |
| `server/app/controllers/concerns/session_serialization.rb` | Include agent_type |
| `cli/internal/api/types.go` | Add AgentType field |
| `cli/internal/parsers/claude_sessions.go` | Set agent_type in ToSessionData |
| `cli/internal/parsers/copilot_sessions.go` | **New** — Copilot parser |
| `cli/internal/parsers/copilot_discovery.go` | **New** — Session discovery |
| `cli/internal/bulk/discovery.go` | Integrate Copilot discovery |
| `cli/internal/hooks/copilot_hooks.go` | **New** — Copilot hook installation |
| `cli/internal/hooks/hooks.go` | Extend `ax init` to call Copilot hook install |
| Tests | New test files |
| `wiki/go-cli.md` | Update parser docs |
| `wiki/data-model.md` | Add agent_type column |
| `docs/setup.md` | Add Copilot CLI setup section |
| `plans/research/copilot-cli.md` | Mark as implemented |

### Phase 3 (dashboard filtering)
| File | Change |
|------|--------|
| `server/app/services/metrics_aggregator.rb` | Agent type filter |
| `server/app/controllers/` (multiple) | Accept agent_type param |
| `dashboard/src/lib/db.ts` | Add agent_type to types, API calls |
| `dashboard/src/components/agent-type-filter.tsx` | **New** component |
| `dashboard/src/components/scope-selector.tsx` | Preserve param |
| `dashboard/src/components/range-toggle.tsx` | Preserve param |
| Session list page | Add badge |
| Demo app | Match |

## Verification

### Phase 1
- `just cli-test` — parser tests pass without cost
- `just server-test` — specs pass with new migration
- `just dashboard-test && just dashboard-typecheck` — no type errors
- Manual: View metric detail page for "token-cost-per-pr", verify shows token counts

### Phase 2
- `just cli-test` — Copilot parser tests pass with fixture data
- `just server-test` — push with agent_type works
- Manual: `ax push --repo .` in a repo with Copilot sessions, verify sessions appear on dashboard

### Phase 3
- `just dashboard-test && just dashboard-typecheck`
- Manual: Filter by agent type on overview, verify metrics adjust
