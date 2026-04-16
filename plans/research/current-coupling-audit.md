# Research: Current Claude Code & Anthropic Coupling Audit

Source: internal code audit, April 2026. All file paths and line numbers relative to repo root at time of audit.

## Scope

Inventory of every place the AX codebase assumes Claude Code as the harness or Anthropic as the model provider. Used to scope the multi-harness / multi-provider plan.

## Claude Code coupling

### CLI — session discovery

**`cli/cmd/ax/main.go:239, 330`**
```go
claudeDir := filepath.Join(home, ".claude")
```
Hardcoded `~/.claude` discovery path in both single-repo push and bulk push.

**`cli/internal/parsers/claude_sessions.go:151-185`**
- Lines 152-154: Claude Code's directory encoding scheme (`/`→`-`, `.`→`-`)
  ```go
  encodedPath := strings.ReplaceAll(strings.ReplaceAll(projectPath, "/", "-"), ".", "-")
  projectDir := filepath.Join(claudeDir, "projects", encodedPath)
  ```
- Line 171: Worktree glob `encodedPath+"--claude-worktrees-*"`
- Comments explicitly document Claude's encoding.

### CLI — session JSONL parsing

**`cli/internal/parsers/claude_sessions.go:58-86`** — struct fields assume Claude Code schema:
- `ParentUUID`, `IsSidechain` — Claude-specific
- `tokenUsage { InputTokens, OutputTokens, CacheCreationInputTokens, CacheReadInputTokens }` — Anthropic-specific

**`cli/internal/parsers/claude_sessions.go:200-302`** — message parsing logic
- `isHumanMessage` filters on Claude patterns (`<command-name>`, `<local-command`)
- `SidechainMessages++` is a Claude-only concept (branching in the UI)

**`cli/internal/parsers/claude_sessions.go:364-396`** — tool-name hardcoding:
- Expects `tool_use` blocks
- Tool names: `Bash`, `Read`, `Glob`, `Edit`, `Write`

### CLI — worktree detection

**`cli/internal/bulk/discovery.go:140-149`**
```go
const marker = "/.claude/worktrees/"
```
Assumes Claude Code's worktree path structure.

### CLI — hook installation

**`cli/internal/hooks/hooks.go:238-242`**
```go
func DefaultSettingsPath() string {
  home, _ := os.UserHomeDir()
  return filepath.Join(home, ".claude", "settings.json")
}
```

**`cli/internal/hooks/hooks.go:45-46`**
```go
var hookEvents = []string{"SessionEnd", "Stop"}
```

**`cli/internal/hooks/hooks.go:31-42`** — `pushCommand()` emits a bash script that:
- Reads session data from stdin (documented as "CWD from hook input")
- Detects worktree paths via hardcoded marker `/.claude/worktrees/`
- Logs to `~/.ax/push.log`

**`cli/internal/hooks/hooks.go:228-235`** — AX hook detection via status strings:
- `"Pushing session data to AX"`
- `"Syncing session data to AX"`
- `"Updating AX session metrics"`

### CLI — push payload shape

**`cli/internal/api/types.go:54-73`** — `SessionData` struct:
```go
type SessionData struct {
  ID                       string   // Claude Code UUID
  Branch                   string
  StartedAt                int64    // millisecond unix (Claude format)
  EndedAt                  int64
  MessageCount             int      // human messages
  TurnCount                int      // Claude Code: human-assistant pairs
  InputTokens              int
  OutputTokens             int
  CacheCreationInputTokens int
  CacheReadInputTokens     int
  TotalCostUSD             float64
  PrimaryModel             string
  FilesReadCount           int
  FilesModifiedCount       int
  AssistantMessageCount    int
  SidechainMessages        int      // Claude Code-specific
  TotalFileReads           int      // Claude Code Re-read metric
}
```

### Rails — push ingestion

**`server/app/services/push_service.rb:105-131`** — direct field-to-column mapping, no normalization, no harness awareness. Missing harness-specific fields default to 0.

**`server/app/services/push_service.rb:156-167`** — `SessionPr` upsert has no harness awareness either.

### Rails — session-PR correlation

**`server/app/services/session_pr_correlation_service.rb:13-34`** — correlates sessions to PRs by branch + time-window overlap. This IS harness-agnostic (good), but depends on sessions having a populated `branch` field and valid timestamps. Some harnesses in headless/IDE modes may not track branch.

### Database schema

**`server/db/schema.rb:224-247`** — `sessions` table:

| Column | Type | Problem |
|---|---|---|
| `id` | string (UUID) | Claude uses UUIDs; others may use sequential or content-hashed IDs |
| `started_at`/`ended_at` | bigint (unix ms) | Fine, but no `harness_type` or `model_provider` |
| `cache_creation_input_tokens` | integer | Anthropic-specific |
| `cache_read_input_tokens` | integer | Anthropic-specific |
| `sidechain_messages` | integer | Claude-specific |
| `primary_model` | string | Raw Claude model ID, no provider field |
| `total_file_reads` | integer | Claude Re-Read metric |
| `assistant_message_count` | integer | Generic |

Missing columns for multi-harness: `harness_type`, `model_provider`, `tool_calls_json` (jsonb).

### Rails — metrics computation

**`server/app/services/metrics_computer.rb:58-70`** — `compute_cache_hit_rate`:
```ruby
total_input = sessions.sum(:input_tokens) +
              sessions.sum(:cache_creation_input_tokens) +
              sessions.sum(:cache_read_input_tokens)
sessions.sum(:cache_read_input_tokens).to_f / total_input
```
For Gemini sessions, cache columns will be 0 and the metric becomes undefined.

**`server/app/services/metrics_computer.rb:74-82`** — `sidechain_rate`: Claude-only by definition.

**`server/app/services/metrics_computer.rb:86-94`** — `re_read_rate`: requires file-read tracking, harness-dependent.

**`server/app/services/metrics_computer.rb:~78`** — `autonomy_score`:
```ruby
sessions.sum(:assistant_message_count).to_f / sessions.sum(:message_count)
```
Mixes harnesses with incompatible message semantics when aggregated across harness-heterogeneous sessions.

### Dashboard

**`dashboard/src/app/(marketing)/setup/page.tsx`** — references "Claude Code" and the `SessionEnd` hook in marketing/setup copy. UI-layer only, easy to generalize once data layer is ready.

## Anthropic / Claude model coupling

### Pricing table

**`cli/internal/pricing/pricing.go:22-39`** — hardcoded Anthropic-only model map:
```go
var Models = map[string]ModelPricing{
  "claude-opus-4-6":          {...},
  "claude-opus-4-5-20250620": {...},
  "claude-sonnet-4-6":        {...},
  "claude-haiku-4-5-20251001": {...},
  ...
}
var defaultPricing = Models["claude-sonnet-4-6"]
```

### Lookup fallback

**`cli/internal/pricing/pricing.go:48-73`**:
```go
func LookupModel(model string) ModelPricing {
  if p, ok := Models[model]; ok { return p }
  for key, p := range Models {
    if strings.HasPrefix(model, key) { return p }
  }
  lower := strings.ToLower(model)
  if strings.Contains(lower, "opus") { return Models["claude-opus-4-6"] }
  if strings.Contains(lower, "haiku") { return Models["claude-haiku-4-5-20251001"] }
  return defaultPricing
}
```
Unknown models silently fall back to Sonnet pricing.

**Impact estimates** if non-Claude models hit this path:
- GPT-4o: actual ~$5/$15 per Mtok; Sonnet fallback ~$3/$15 → ~25–40% under-cost
- Gemini 1.5 Pro: actual ~$1.25/$5; Sonnet fallback ~$3/$15 → ~150–200% over-cost

### ModelPricing struct

**`cli/internal/pricing/pricing.go:12-18`**:
```go
type ModelPricing struct {
  InputPerMTok         float64
  OutputPerMTok        float64
  CacheReadPerMTok     float64
  CacheCreationPerMTok float64
}
```
Assumes Anthropic's explicit cache-creation/cache-read billing. Doesn't generalize to:
- OpenAI (cache creation = 50% of input rate, cache read = 10% of input rate — different calculation)
- Gemini (cache is a system-message concept, billed at 10% of input rate, no per-token tracking)

### Server — raw model storage

**`server/db/schema.rb:237`**: `t.string "primary_model"` — no provider field, no normalization.
**`server/app/services/push_service.rb:121`**: `primary_model: session_data[:primary_model]` — raw pass-through.

## Token-taxonomy compatibility across providers

| Field | Anthropic | OpenAI | Gemini |
|---|---|---|---|
| Input tokens | ✓ | ✓ | ✓ |
| Output tokens | ✓ | ✓ | ✓ |
| Cache creation tokens | ✓ (explicit) | ✓ since late 2024 (different billing) | ✗ (system-level only) |
| Cache read tokens | ✓ (explicit) | ✓ (10% of input rate) | ✗ (10% of input rate, not per-token) |
| Usage exposed per-response | ✓ | ✓ | ✓ |

## Severity summary

**Critical (must address to support any non-Claude harness or non-Anthropic provider):**
- `claude_sessions.go` JSONL parser coupling (58-86, 200-302, 364-396)
- `pricing.go` lookup + struct (12-18, 22-39, 48-73)
- `metrics_computer.rb` cache_hit_rate / sidechain_rate / re_read_rate (58-94)

**High (significant refactor required):**
- CLI hardcoded paths (`main.go:239,330`, `hooks.go:238-242`)
- Hook event & install shape (`hooks.go:31-46`)
- Push payload shape (`api/types.go:54-73`)
- Push ingestion (`push_service.rb:105-131`)
- Schema missing `harness_type`/`model_provider` (`schema.rb:224-247`)

**Low (easy once data layer is ready):**
- Dashboard marketing copy
- Hook status-string detection
