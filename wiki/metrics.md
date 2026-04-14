# Metrics

AX computes 16 metrics across 4 categories. Full metrics are only computed for finalized (merged or closed) PRs. Open PRs are visible in the dashboard (with partial metrics and a "pending" indicator), but aggregate statistics (averages, trend lines) use settled PRs only.

Each metric has detailed documentation in `docs/metrics/` and is viewable in the dashboard at `/docs/[slug]`.

## Categories

### Output Quality

Measures the quality of code produced by the agent-human collaboration.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Post-Open Commits | int | GitHub | Commits pushed after PR was opened. Lower = cleaner first draft. |
| First-Pass Acceptance | bool | GitHub | No CHANGES_REQUESTED reviews. True = reviewer approved without requesting changes. |
| CI Success Rate | float | GitHub | Passing CI checks / total checks. 1.0 = all green. |
| Test Coverage | bool/nil | GitHub | Whether the PR includes test files (pattern-matched by filename). Nil when PR only touches non-testable files (docs, CI, config). |
| Diff Churn | int | GitHub | Lines added across all commits minus lines in the final diff. Higher = more rework. Per-commit stats fetched individually via GitHub API. |
| Line Revisit Rate | float | GitHub | Files in this PR that were also changed in other PRs finalized within the last 7 days. Higher = unstable areas. |

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
| Self-Correction Rate | float | Sessions | `bash_successes / (bash_successes + bash_errors)` — higher = more commands succeed without human help. |
| Context Efficiency | float | Sessions | `files_modified / files_read` — higher = more focused, lower = more exploration. |
| Error Recovery Attempts | int | Sessions | Total Bash errors across correlated sessions. Lower = fewer recovery cycles needed. |

### Planning Effectiveness

Measures how well plans translated into implementation.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Plan Coverage | float | Sessions + GitHub | Fraction of actual changed files that were in the plan. Planned files extracted from plan documents by CLI and compared against PR files from GitHub API. |
| Plan Deviation | float | Sessions + GitHub | Fraction of planned files that were actually changed. 1.0 = every planned file was touched. |
| Scope Creep | bool | Sessions + GitHub | True when >50% of changed files were not in the plan. |

### Repo-Level

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Unmerged Token Spend | float | Sessions | Dollar cost of tokens spent on PRs that were never merged. Waste rate. |

## Computation

All metric computation happens server-side in the Rails application.

- **GitHub-sourced metrics** (output quality) are computed from webhook data and GitHub API at PR finalization (merge/close)
- **Session-dependent metrics** (prompt efficiency, agent behavior) are computed after session data is pushed from the CLI and correlated to PRs
- **Plan analysis metrics** (planning effectiveness) are computed after session-PR correlation, comparing planned files (from CLI push) against PR files (from GitHub API)

Server-side computation is split between two services:

- **`MetricsComputer`** — Computes `diff_churn_lines` (per-commit stats via individual commit API), `has_tests` (with non-testable file filtering), `line_revisit_rate` (7-day lookback), session-derived metrics (`self_correction_rate`, `context_efficiency`, `error_recovery_attempts`), and plan metrics (`plan_coverage_score`, `plan_deviation_score`, `scope_creep_detected`)
- **`SessionPrCorrelationService`** — Aggregates `messages_per_pr`, `token_cost_usd`, `iteration_depth` from correlated session data, and triggers plan metrics computation

The Go `internal/metrics/` package contains the original metric calculator implementations as pure functions (reference implementations).

## Finalization

Metrics follow a strict lifecycle:

```
PR opened
  → metrics initialized (all null)
  → individual metrics updated as data arrives
  → PR reaches terminal state (merged or closed)
  → metrics_finalized = true, finalized_at = timestamp
  → GitHub-derived fields locked; session-derived fields remain updatable
```

### Why finalize?
- Prevents partial GitHub metrics from appearing in aggregate reports
- Ensures comparisons are apples-to-apples (all PRs measured at the same lifecycle stage)
- Late-arriving session data can still enrich already-settled PRs (the normal case — developers push after PRs merge)

### Scoped write protection
- **GitHub-derived** (locked after finalization): `post_open_commits`, `first_pass_accepted`, `ci_success_rate`, `diff_churn_lines`, `has_tests`, `line_revisit_rate`
- **Session-derived** (always updatable via `update_session_metrics!`): `messages_per_pr`, `iteration_depth`, `token_cost_usd`, `self_correction_rate`, `context_efficiency`, `error_recovery_attempts`, `plan_coverage_score`, `plan_deviation_score`, `scope_creep_detected`

### Where is finalization enforced?
- **Rails**: `PrMetrics` model has a `before_update` callback (`prevent_settled_github_update`) that blocks changes to GitHub-derived fields once `metrics_finalized = true`
- **Webhooks**: All handlers check `pr_finalized?` before updating GitHub fields

### Webhook-triggered finalization
`PrMerged` and `PrClosed` webhook handlers set `metrics_finalized = true`. This happens in real time as GitHub sends events.

## Metric Storage

### PostgreSQL (`pr_metrics` table)
One row per PR. All 16 metrics as columns plus `metrics_finalized` (bool) and `finalized_at` (timestamp).

### Repo-level metrics (`repo_metrics` table)
Aggregated by period. Contains total_sessions, total_tokens, total_cost_usd, unmerged_tokens, unmerged_cost_usd, unmerged_rate.

See [Data Model](data-model.md) for full schema.
