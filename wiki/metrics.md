# Metrics

AX computes 16 metrics across 4 categories. Metrics are only computed for finalized (merged or closed) PRs. Open PRs are excluded from reports and the dashboard entirely.

Each metric has detailed documentation in `docs/metrics/` and is viewable in the dashboard at `/docs/[slug]`.

## Categories

### Output Quality

Measures the quality of code produced by the agent-human collaboration.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Post-Open Commits | int | GitHub | Commits pushed after PR was opened. Lower = cleaner first draft. |
| First-Pass Acceptance | bool | GitHub | No CHANGES_REQUESTED reviews. True = reviewer approved without requesting changes. |
| CI Success Rate | float | GitHub | Passing CI checks / total checks. 1.0 = all green. |
| Test Coverage | bool | Git | Whether the PR includes test files (pattern-matched by filename). |
| Diff Churn | int | Git | Lines added across all commits minus lines in the final diff. Higher = more rework. |
| Line Revisit Rate | float | Git | Files in this PR that were also changed in other recent PRs. Higher = unstable areas. |

### Prompt Efficiency

Measures how efficiently the human directed the agent.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Messages per PR | int | Sessions | Total human+assistant messages across correlated sessions. |
| Iteration Depth | int | Sessions | Number of human turns (back-and-forth cycles). |
| Token Cost per PR | float | Sessions | Dollar cost of all tokens used, computed with model-specific pricing. |

### Agent Behavior

Measures how the agent performed during the coding session.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Self-Correction Rate | float | Sessions | Ratio of tool calls that fixed errors from prior tool calls. |
| Context Efficiency | float | Sessions | Ratio of tokens actively used vs tokens loaded into context. |
| Error Recovery Attempts | int | Sessions | Number of times the agent retried after a failed tool call. |

### Planning Effectiveness

Measures how well plans translated into implementation.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Plan Coverage | float | Sessions + Git | Fraction of planned files that were actually changed. |
| Plan Deviation | float | Sessions + Git | Fraction of changed files that were not in the plan. |
| Scope Creep | bool | Sessions + Git | Whether significant unplanned work was detected. |

### Repo-Level

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Unmerged Token Spend | float | Sessions | Dollar cost of tokens spent on PRs that were never merged. Waste rate. |

## Computation

### Phase 1: GitHub-Sourced (during sync)
Computed from PR reviews, CI checks, and git history. Does not require session data.

Metrics: post_open_commits, first_pass_accepted, ci_success_rate, has_tests, diff_churn_lines, line_revisit_rate

Code: `internal/metrics/output_quality.go`

### Phase 2: Session-Dependent (after correlation)
Computed from Claude Code session data, after sessions are linked to PRs.

If a session correlates to N PRs, its contribution is divided by N (weighted metrics).

Metrics: messages_per_pr, iteration_depth, token_cost_usd, self_correction_rate, context_efficiency, error_recovery_attempts

Code: `internal/metrics/agent_behavior.go`, `internal/sync/finalize.go` (ComputeSessionMetricsForPR)

### Phase 3: Plan Analysis
Compares `.plan` files from sessions against actual file changes in the PR.

Metrics: plan_coverage_score, plan_deviation_score, scope_creep_detected

Code: `internal/metrics/planning.go`

## Finalization

Metrics follow a strict lifecycle:

```
PR opened
  → metrics initialized (all null)
  → individual metrics updated as data arrives
  → PR reaches terminal state (merged or closed)
  → ALL metrics finalized: metrics_finalized = true, finalized_at = timestamp
  → Record becomes immutable
```

### Why finalize?
- Prevents partial metrics from appearing in reports
- Ensures comparisons are apples-to-apples (all PRs measured at the same lifecycle stage)
- Immutability means historical data never changes retroactively

### Where is finalization enforced?
- **SQLite (CLI)**: `internal/sync/finalize.go` checks `metrics_finalized` before writing
- **Rails**: `PrMetrics` model has a `before_update` callback that raises if already finalized
- **Webhooks**: All handlers check `pr_finalized?` before updating

### Webhook-triggered finalization
In managed mode, `PrMerged` and `PrClosed` webhook handlers set `metrics_finalized = true`. This happens in real time as GitHub sends events.

### CLI-triggered finalization
During `ax sync` or `ax watch`, the CLI detects terminal PR states and calls `FinalizePR()`.

## Metric Storage

### SQLite (`pr_metrics` table)
One row per PR. All 16 metrics as columns plus `metrics_finalized` (bool) and `finalized_at` (timestamp).

### PostgreSQL (`pr_metrics` table)
Same schema. The `PrMetrics` model mirrors the SQLite structure.

### Repo-level metrics (`repo_metrics` table)
Aggregated by period. Contains total_sessions, total_tokens, total_cost_usd, unmerged_tokens, unmerged_cost_usd, unmerged_rate.

See [Data Model](data-model.md) for full schema.
