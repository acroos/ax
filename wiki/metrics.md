# Metrics

AX computes 9 metrics across 3 categories. 3 are PR-derived (from GitHub data, stored in `pr_metrics`) and 6 are session-derived (computed on-the-fly from the `sessions` table). Full PR metrics are only computed for finalized (merged or closed) PRs. Open PRs are visible in the dashboard (with partial metrics and a "pending" indicator), but PR-derived aggregate statistics (averages, trend lines) use settled PRs only. Session-derived metrics include all pushed sessions regardless of PR association.

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

- **`MetricsComputer`** — Computes `ci_success_rate` (from per-commit `ci_passed` values on the `commits` table) and `line_revisit_rate` (7-day lookback). Only handles GitHub-derived metrics.
- **`SessionPrCorrelationService`** — Matches sessions to PRs by branch name and temporal overlap. Creates `SessionPr` join records only — does **not** compute or write session-derived metrics to `pr_metrics`.
- **`MetricsAggregator`** — Computes windowed aggregate metrics for the overview page. Takes two scopes: a `PrMetrics` scope (pre-filtered to org/repo + `metrics_finalized: true`, must join `prs`) for PR-derived metrics, and a `CodingSession` scope for session-derived metrics. Applies a configurable window (7/30/90 days) and returns: `{ totalPRs, totalSessions, sessionDataCount, metrics: { [slug]: { current, prior, sparkline } } }`. PR metrics are dated by merge/close date (`COALESCE(prs.merged_at, prs.closed_at)`). Session metrics are dated by session end time (`sessions.ended_at`). Current = average over the window; prior = average over the preceding window (for delta computation). Sparkline = daily buckets with `AVG` per metric. Empty days are null (gaps in the sparkline). Session-derived metrics (cache_hit_rate, sidechain_rate, etc.) are computed inline from raw session columns using SQL expressions (`SESSION_METRIC_EXPRESSIONS`), not from pre-computed values.
- **`PrsController#show`** — Computes session-derived metrics on-the-fly for the PR detail endpoint by aggregating across linked sessions (via `session_prs` join). Uses SQL expressions consistent with `MetricsAggregator` but aggregated per-PR (MAX for iteration_depth, SUM for token_cost_usd, weighted ratios for rates).
- **`MetricDetailComputer`** — Computes all data for the metric detail drill-down page for a single metric. Takes a metric slug, PR/session scopes, and window days. Returns: `{ count, total_count, stats (avg/P10/P50/P90), prior_stats, trend (daily buckets with avg/min/max/count), distribution (histogram buckets), notable_highest, notable_lowest }`. Handles both PR-derived and session-derived metrics. Pre-computes all Arel SQL fragments at class load from frozen constants (same pattern as `MetricsAggregator`). Exposed via `metric_detail` controller actions at org, me, team, and repo scopes.
- **`SessionSerialization`** — Computes per-session metric values via SQL aliases for the session list endpoints. Each session response includes a `metrics` object with all 6 session-derived metric values.

The Go `cli/internal/metrics/` package contains the original metric calculator implementations as pure functions (reference implementations).

## Finalization

Metrics follow a strict lifecycle:

```
PR opened
  → pr_metrics initialized (GitHub-derived fields, all null)
  → individual metrics updated as data arrives
  → PR reaches terminal state (merged or closed)
  → metrics_finalized = true, finalized_at = timestamp
  → GitHub-derived fields locked
```

### Why finalize?
- Prevents partial GitHub metrics from appearing in aggregate reports
- Ensures comparisons are apples-to-apples (all PRs measured at the same lifecycle stage)

### Write protection
- **CI-derived** (updatable after finalization): `ci_success_rate` — computed from per-commit `ci_passed` values. Updated via `update_column` by `CiCompleted` webhook handler (uses the commit's PR association, not the webhook payload's `pull_requests` array) and by `ReconcileCiDataJob` (runs every 6 hours) to handle late-arriving check suite results.
- **GitHub-derived** (locked after finalization): `post_open_commits`, `line_revisit_rate`

Session-derived metrics are not stored on `pr_metrics` — they are computed on-the-fly from the `sessions` table and are always available regardless of finalization status.

### Where is finalization enforced?
- **Rails**: `PrMetrics` model has a `before_update` callback (`prevent_settled_github_update`) that blocks changes to GitHub-derived fields once `metrics_finalized = true`
- **Webhooks**: All handlers check `pr_finalized?` before updating GitHub fields

### Webhook-triggered finalization
`PrMerged` and `PrClosed` webhook handlers set `metrics_finalized = true`. This happens in real time as GitHub sends events. The fetch-compute-finalize flow is wrapped in a database transaction with pessimistic locking:

- If `GithubDataFetcher` or `MetricsComputer` fails, the transaction rolls back and the PR stays **unfinalized** — the daily `ReconcileReposJob` will retry
- `finalize_metrics` acquires a row lock (`with_lock`) and re-checks `finalized?` to prevent concurrent finalization races
- `finalized_at` is set only once (idempotent) — webhook redelivery preserves the original timestamp

## Metric Storage

### PR metrics — PostgreSQL (`pr_metrics` table)
One row per PR. 3 GitHub-derived metrics (`post_open_commits`, `ci_success_rate`, `line_revisit_rate`) as columns plus `metrics_finalized` (bool) and `finalized_at` (timestamp).

### Session metrics — computed on-the-fly
The 6 session-derived metrics (`iteration_depth`, `token_cost_usd`, `cache_hit_rate`, `sidechain_rate`, `re_read_rate`, `autonomy_score`) are **not** persisted in `pr_metrics`. They are computed at query time from raw session data in the `sessions` table using SQL expressions. This approach:
- Avoids write contention on the `pr_metrics` table from late-arriving session data
- Ensures session metrics are always up-to-date when new sessions are pushed
- Allows aggregate session metrics to include sessions not associated with any PR

See [Data Model](data-model.md) for full schema.
