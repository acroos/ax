# Metrics

AX computes 9 PR-level metrics across 3 categories. Full metrics are only computed for finalized (merged or closed) PRs. Open PRs are visible in the dashboard (with partial metrics and a "pending" indicator), but aggregate statistics (averages, trend lines) use settled PRs only.

Each metric has detailed documentation in `docs/metrics/` and is viewable in the dashboard at `/docs/[slug]`.

See [ADR-001](../docs/decisions/001-metrics-selection.md) for the original metric selection and [ADR-015](../docs/decisions/015-metric-pruning.md) for the 2026-04-16 pruning.

## Categories

### Output Quality

Measures the quality of code produced by the agent-human collaboration and the feedback loop.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Post-Open Commits | int | GitHub | Commits pushed after PR was opened. Lower = cleaner first draft. |
| CI Success Rate | float | GitHub | Fraction of commits on the PR that passed all CI check suites. Per-commit CI status (`ci_passed`) is stored on the `commits` table, fetched via `list_check_suites` per commit SHA. At finalization, completed suites are evaluated immediately; in-progress suites are deferred to webhooks and the `ReconcileCiDataJob`. |
| Line Revisit Rate | float | GitHub | Files in this PR that were also changed in other PRs finalized within the last 7 days. Higher = unstable areas. |

### Prompt Efficiency

Measures how efficiently the human directed the agent.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Iteration Depth | int | Sessions | Number of human turns (back-and-forth cycles). |
| Token Cost per PR | float | Sessions | Dollar cost of all tokens used, computed with model-specific pricing. |
| Cache Hit Rate | float | Sessions | Ratio of cache-read tokens to total input tokens. Higher = better cache utilization. |

### Agent Behavior

Measures how the agent performed during the coding session.

| Metric | Type | Source | What it measures |
|--------|------|--------|------------------|
| Sidechain Rate | float | Sessions | Fraction of messages on sidechain branches (backtracking). Lower = fewer dead-end paths. |
| Re-Read Rate | float | Sessions | `total_file_reads / unique_files_read` — 1.0 = no re-reads, higher = redundant reading. |
| Autonomy Score | float | Sessions | `assistant_messages / human_messages` — higher = agent works more independently. |

## Computation

All metric computation happens server-side in the Rails application.

- **GitHub-sourced metrics** (output quality) are computed from webhook data and GitHub API at PR finalization (merge/close)
- **Session-dependent metrics** (prompt efficiency, agent behavior) are computed directly from session data in the `sessions` table. Sessions do not need to be associated with a PR — all pushed session data is included in aggregate metrics.

Server-side computation is split between three services:

- **`MetricsComputer`** — Computes `ci_success_rate` (from per-commit `ci_passed` values on the `commits` table), `line_revisit_rate` (7-day lookback), and session-derived metrics (`cache_hit_rate`, `sidechain_rate`, `re_read_rate`, `autonomy_score`). Used by `SessionPrCorrelationService` to write per-PR session metrics.
- **`SessionPrCorrelationService`** — Aggregates `token_cost_usd` and `iteration_depth` from correlated session data, and calls MetricsComputer to compute all derived metrics. Writes results to `pr_metrics` for per-PR display.
- **`MetricsAggregator`** — Computes windowed aggregate metrics for the overview page. Takes two scopes: a `PrMetrics` scope (pre-filtered to org/repo + `metrics_finalized: true`, must join `prs`) for PR-derived metrics, and a `CodingSession` scope for session-derived metrics. Applies a configurable window (7/30/90 days) and returns: `{ totalPRs, totalSessions, sessionDataCount, metrics: { [slug]: { current, prior, sparkline } } }`. PR metrics are dated by merge/close date (`COALESCE(prs.merged_at, prs.closed_at)`). Session metrics are dated by session end time (`to_timestamp(sessions.ended_at / 1000.0)`). Current = average over the window; prior = average over the preceding window (for delta computation). Sparkline = daily buckets with `AVG` per metric. Empty days are null (gaps in the sparkline). Session-derived metrics (cache_hit_rate, sidechain_rate, etc.) are computed inline from raw session columns using SQL expressions, not from pre-computed `pr_metrics` values.

The Go `cli/internal/metrics/` package contains the original metric calculator implementations as pure functions (reference implementations).

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
- **CI-derived** (updatable after finalization): `ci_success_rate` — computed from per-commit `ci_passed` values. Updated via `update_column` by `CiCompleted` webhook handler (uses the commit's PR association, not the webhook payload's `pull_requests` array) and by `ReconcileCiDataJob` (runs every 6 hours) to handle late-arriving check suite results.
- **GitHub-derived** (locked after finalization): `post_open_commits`, `line_revisit_rate`
- **Session-derived** (always updatable via `update_session_metrics!`): `iteration_depth`, `token_cost_usd`, `cache_hit_rate`, `sidechain_rate`, `re_read_rate`, `autonomy_score`

### Where is finalization enforced?
- **Rails**: `PrMetrics` model has a `before_update` callback (`prevent_settled_github_update`) that blocks changes to GitHub-derived fields once `metrics_finalized = true`
- **Webhooks**: All handlers check `pr_finalized?` before updating GitHub fields

### Webhook-triggered finalization
`PrMerged` and `PrClosed` webhook handlers set `metrics_finalized = true`. This happens in real time as GitHub sends events. The fetch-compute-finalize flow is wrapped in a database transaction with pessimistic locking:

- If `GithubDataFetcher` or `MetricsComputer` fails, the transaction rolls back and the PR stays **unfinalized** — the daily `ReconcileReposJob` will retry
- `finalize_metrics` acquires a row lock (`with_lock`) and re-checks `finalized?` to prevent concurrent finalization races
- `finalized_at` is set only once (idempotent) — webhook redelivery preserves the original timestamp

## Metric Storage

### PostgreSQL (`pr_metrics` table)
One row per PR. All 9 PR-level metrics as columns plus `metrics_finalized` (bool) and `finalized_at` (timestamp).

See [Data Model](data-model.md) for full schema.
