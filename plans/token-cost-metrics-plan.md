# Plan: Add Token Cost per PR and Unmerged Token Spend Metrics

## Context

AX currently has 14 metrics, all scoped per-PR. "Token Usage per PR" was previously deferred because raw token counts are noisy without task complexity context. We're now revisiting this as **cost** (dollars, not raw counts), which is more actionable — you can see if a $40 PR should have been a $5 PR. We're also adding a repo-level metric for tokens spent on work that never merges, to surface spend patterns on abandoned/closed PRs.

These are metrics **#15** (Token Cost per PR) and **#16** (Unmerged Token Spend).

---

## Metric Definitions

### Metric 15: Token Cost per PR
- **Category:** Prompt Efficiency
- **Phase:** 2 (requires session data)
- **Scope:** Per-PR
- **What:** Total dollar cost of tokens consumed across all Claude Code sessions correlated to a PR
- **Calculation:** For each correlated session, sum per-message costs (input tokens × model input price + output tokens × model output price + cache tokens at respective rates). Aggregate across sessions.
- **Why it matters:** High token cost on simple PRs signals inefficient workflows — poor prompts, unnecessary iteration, or excessive context loading

### Metric 16: Unmerged Token Spend
- **Category:** Prompt Efficiency
- **Phase:** 2 (requires session data)
- **Scope:** Repo-level aggregate (NOT per-PR)
- **What:** Total dollar cost of tokens from sessions that either (a) correlate to PRs closed without merging, or (b) don't correlate to any PR at all
- **Calculation:** `unmerged_cost / total_cost` as a rate, plus absolute dollar amounts. Computed over time periods (week/month).
- **Edge case:** Sessions correlated to still-open PRs are "in-progress" and excluded from both numerator and denominator of the waste rate. Only closed-not-merged and uncorrelated sessions count.

---

## Implementation Steps

### Step 1: Pricing module
**New file:** `internal/pricing/pricing.go`

- `ModelPricing` struct: `InputPerMTok`, `OutputPerMTok`, `CacheReadPerMTok`, `CacheCreationPerMTok` (all `float64`, price per million tokens)
- `var Models = map[string]ModelPricing{...}` with current Claude model pricing (Opus, Sonnet, Haiku)
- `func ComputeCost(model string, input, output, cacheRead, cacheCreation int) float64` — looks up model, computes cost. Falls back to Sonnet pricing for unknown models.
- `const PricingVersion = "2026-03-24"` — for tracking when prices were last updated
- **Test file:** `internal/pricing/pricing_test.go`

### Step 2: Schema migration (version 2)
**File:** `internal/db/db.go` — append to `migrations` slice

```sql
-- Add token tracking to sessions
ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN cache_creation_input_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN cache_read_input_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN total_cost_usd REAL;
ALTER TABLE sessions ADD COLUMN primary_model TEXT;

-- Add token cost to pr_metrics
ALTER TABLE pr_metrics ADD COLUMN token_cost_usd REAL;

-- New repo-level metrics table
CREATE TABLE repo_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL REFERENCES repos(id),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    period_type TEXT NOT NULL,  -- 'week', 'month'
    total_sessions INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0,
    unmerged_tokens INTEGER DEFAULT 0,
    unmerged_cost_usd REAL DEFAULT 0,
    unmerged_rate REAL,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(repo_id, period_start, period_type)
);

CREATE INDEX idx_repo_metrics_repo ON repo_metrics(repo_id);
```

### Step 3: Update models
**File:** `internal/db/models.go`

- Add to `Session` struct: `InputTokens`, `OutputTokens`, `CacheCreationInputTokens`, `CacheReadInputTokens` (int), `TotalCostUSD` (sql.NullFloat64), `PrimaryModel` (sql.NullString)
- Add to `PRMetrics` struct: `TokenCostUSD sql.NullFloat64`
- Add new `RepoMetrics` struct with fields matching the table

### Step 4: Add queries
**File:** `internal/db/queries.go`

- Update existing session upsert to include token columns
- Update `UpsertPRMetrics` to include `token_cost_usd`
- Add `UpsertRepoMetrics(db, m *RepoMetrics) error`
- Add `GetRepoMetrics(db, repoID int64, periodType string) ([]RepoMetrics, error)`
- Add `ComputeTokenCostForPR(db, prID int64) (float64, error)` — sums `total_cost_usd` from sessions via `session_prs`
- Add `ComputeUnmergedTokenData(db, repoID int64, periodStart, periodEnd string) (RepoMetrics, error)` — LEFT JOIN sessions → session_prs → prs, classifies by merge state

### Step 5: Metric calculators
**Files:**
- `internal/metrics/token_cost.go` — `ComputeTokenCostPerPR(db, prID) (float64, error)` wrapping the query
- `internal/metrics/repo_metrics.go` — `ComputeUnmergedTokenSpend(db, repoID, periodStart, periodEnd) (*RepoMetrics, error)` with the waste classification logic

### Step 6: Session parser token extraction
**File:** `internal/parsers/claude_sessions.go` (extends planned Phase 2 parser)

- When parsing session JSONL, extract `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` and `message.model` from each assistant message
- Deduplicate by `message.id` (same message can appear across multiple JSONL chunks with identical usage)
- Determine `primary_model` as the model used in the majority of messages
- Compute `total_cost_usd` using the pricing module per-message (handles mixed-model sessions correctly)

### Step 7: Documentation
**New files:**
- `docs/metrics/token-cost-per-pr.md` — full metric doc following existing template
- `docs/metrics/unmerged-token-spend.md` — same template, noting repo-level scope

**Updates:**
- `docs/metrics/index.md` — add rows #15 and #16 to the table; move "Token Usage per PR" from Deferred section (note it evolved into Token Cost per PR)
- `docs/decisions/001-metrics-selection.md` — update deferred list
- New ADR: `docs/decisions/009-token-cost-metrics.md` — documents the decision to add these metrics, pricing approach, and repo_metrics table

### Step 8: Tests
- `internal/pricing/pricing_test.go` — verify cost computation for known inputs across models
- Extend `internal/db/db_test.go` — test migration v2, new queries, repo_metrics CRUD
- Session parser token extraction tests with fixture JSONL data

---

## Sequencing

These metrics depend on Phase 2 infrastructure (session parser + correlator). Within Phase 2:

1. Base session parser + correlator (prerequisite, already planned)
2. **Pricing module** (Step 1 — no dependencies, can be built first)
3. **Schema migration** (Step 2) + **models** (Step 3) + **queries** (Step 4)
4. **Session parser token extraction** (Step 6 — extends base parser)
5. **Token Cost per PR calculator** (Step 5a)
6. **Unmerged Token Spend calculator** (Step 5b)
7. **Documentation + ADR** (Step 7)
8. **Tests** (Step 8 — throughout, but final integration tests here)

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Store raw tokens AND cost | Yes | Raw tokens allow recomputation when pricing changes; cost is precomputed for fast reads |
| Pricing approach | Hardcoded Go map | Simple, transparent. Store `PricingVersion` so we know when to recompute |
| Mixed-model sessions | `primary_model` on session, per-message cost computation | Accurate cost without schema complexity of per-model-per-session breakdown |
| Metric 2 scope | Repo-level only | Simpler, answers the core question without per-PR drill-down complexity |
| Metric 2 framing | "Unmerged Token Spend" | Neutral — no judgment on whether unmerged work was wasted |
| Open PRs in waste calc | Excluded | In-progress work isn't waste; only closed-not-merged and uncorrelated sessions count |

---

## Verification

1. **Unit tests:** Pricing computation returns correct values for each model type
2. **Migration test:** v2 migration applies cleanly on top of v1; existing data is preserved
3. **Query tests:** Token cost aggregation across sessions returns expected sums; waste classification correctly handles merged, closed, open, and uncorrelated sessions
4. **Integration test:** Parse a fixture session JSONL → ingest into DB → compute Token Cost per PR → verify dollar amount matches manual calculation
5. **Repo metrics test:** Compute Unmerged Token Spend for a repo with a mix of merged PRs, closed PRs, open PRs, and orphan sessions → verify waste rate
