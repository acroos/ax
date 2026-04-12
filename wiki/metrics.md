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
| Test Coverage | bool | GitHub | Whether the PR includes test files (pattern-matched by filename). |
| Diff Churn | int | GitHub | Lines added across all commits minus lines in the final diff. Higher = more rework. |
| Line Revisit Rate | float | GitHub | Files in this PR that were also changed in other recent PRs. Higher = unstable areas. |

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

All metric computation happens server-side in the Rails application.

- **GitHub-sourced metrics** (output quality) are computed from webhook data as PR events arrive
- **Session-dependent metrics** (prompt efficiency, agent behavior) are computed after session data is pushed from the CLI and correlated to PRs
- **Plan analysis metrics** (planning effectiveness) are computed from plan files referenced in session data

The Go `internal/metrics/` package contains the original metric calculator implementations as pure functions. These are being ported to Ruby for server-side use.

Code: `internal/metrics/output_quality.go`, `agent_behavior.go`, `prompt_efficiency.go`, `planning.go`

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
- **Rails**: `PrMetrics` model has a `before_update` callback that raises if already finalized
- **Webhooks**: All handlers check `pr_finalized?` before updating

### Webhook-triggered finalization
`PrMerged` and `PrClosed` webhook handlers set `metrics_finalized = true`. This happens in real time as GitHub sends events.

## Metric Storage

### PostgreSQL (`pr_metrics` table)
One row per PR. All 16 metrics as columns plus `metrics_finalized` (bool) and `finalized_at` (timestamp).

### Repo-level metrics (`repo_metrics` table)
Aggregated by period. Contains total_sessions, total_tokens, total_cost_usd, unmerged_tokens, unmerged_cost_usd, unmerged_rate.

See [Data Model](data-model.md) for full schema.
