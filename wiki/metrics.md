# Metrics

AX computes 15 metrics across 3 categories. 9 are displayed on the overview dashboard; 6 are hidden from the overview but still computed and accessible via detail pages. 4 displayed metrics are PR-derived (from GitHub data and session joins) and 5 are session-derived (computed on-the-fly from the `sessions` table). Full PR metrics are only computed for finalized (merged or closed) PRs. Open PRs are visible in the dashboard (with partial metrics and a "pending" indicator), but PR-derived aggregate statistics (averages, trend lines) use settled PRs only. Session-derived metrics include all pushed sessions regardless of PR association.

Each metric has detailed documentation in `docs/metrics/` and is viewable in the dashboard at `/docs/[slug]`.

See [ADR-001](../docs/decisions/001-metrics-selection.md) for the original metric selection, [ADR-015](../docs/decisions/015-metric-pruning.md) for the 2026-04-16 pruning, and [ADR-017](../docs/decisions/017-metric-restructuring.md) for the 2026-04-23 restructuring into the current categories.

## Categories

### Delivery

Measures how quickly and cleanly code ships from idea to merged PR.

| Metric | Type | Source | Displayed | What it measures |
|--------|------|--------|-----------|------------------|
| Task Cycle Time | float | PR + Sessions | Yes | Hours from the first coding session to PR merge or close. Requires a `session_prs` join to find the earliest linked session. Lower = faster delivery. |
| PR Throughput | float | PR (aggregate) | Yes | Merged PRs per contributor per week. A special aggregate metric with no per-PR backing value. Higher = team ships more frequently. |
| Post-Open Commits | int | GitHub | Yes | Commits pushed after PR was opened. Lower = cleaner first draft. |
| CI Success Rate | float | GitHub | No | Fraction of commits on the PR that passed all CI check suites. Per-commit CI status (`ci_passed`) is stored on the `commits` table, fetched via `list_check_suites` per commit SHA. At finalization, completed suites are evaluated immediately; in-progress suites are deferred to webhooks and the `ReconcileCiDataJob`. |
| Line Revisit Rate | float | GitHub | No | Files in this PR that were also changed in other PRs finalized within the last 7 days. Higher = unstable areas. |

### Session Effectiveness

Measures how efficiently the human directed the agent and how well the session used resources.

| Metric | Type | Source | Displayed | What it measures |
|--------|------|--------|-----------|------------------|
| Iteration Depth | int | Sessions | Yes | Number of human turns (back-and-forth cycles). |
| Peak Context Window | float | Sessions | Yes | Highest percentage of the model's context window used in any single message. CLI pre-computes this as `peak_context_pct` (0.0-1.0) using model-specific max context limits. High values mean the session is pushing against limits. |
| Autonomy Score | float | Sessions | Yes | `assistant_messages / human_messages` — higher = agent works more independently. |
| Token Total per PR | int | Sessions | No | Input plus output tokens used across correlated sessions. |
| Cache Hit Rate | float | Sessions | No | Ratio of cache-read tokens to total input tokens. Higher = better cache utilization. |
| Sidechain Rate | float | Sessions | No | Fraction of Claude Code messages on sidechain branches (backtracking). Lower = fewer dead-end paths. Copilot CLI sessions are excluded because they do not expose an equivalent signal. |
| Re-Read Rate | float | Sessions | No | `total_file_reads / unique_files_read` — 1.0 = no re-reads, higher = redundant reading. |

### Adoption Maturity

Measures how deeply the team has adopted advanced agent capabilities and whether code review keeps pace.

| Metric | Type | Source | Displayed | What it measures |
|--------|------|--------|-----------|------------------|
| Skill & Tool Usage | float | Sessions | Yes | `(skill_tool_calls + mcp_tool_calls) / total_tool_calls` — fraction of tool calls using slash commands or custom MCP tools. Higher = leveraging advanced capabilities. |
| Subagent Delegation | float | Sessions | Yes | `agent_tool_calls / total_tool_calls` — fraction of tool calls that delegate to subagents. Higher = parallelizing work effectively. |
| Rubber Stamp Rate | float | GitHub | Yes | Binary per-PR: 1 if diff >= 50 lines AND open-to-merge <= 5 minutes, else 0. Aggregate = fraction of PRs flagged. Lower = more thorough review. |

## Displayed vs Hidden

The dashboard overview shows 9 metrics (3 per category). The remaining 6 are still computed and accessible via metric detail pages (e.g., `/metrics/cache-hit-rate`). The `displayed` flag in `metric-defs.ts` controls which metrics appear on the overview grid.

## Computation

All metric computation happens server-side in the Rails application.

- **GitHub-sourced metrics** (Post-Open Commits, CI Success Rate, Line Revisit Rate, Rubber Stamp Rate) are computed from webhook data and GitHub API at PR finalization (merge/close)
- **Session-dependent metrics** (Iteration Depth, Autonomy Score, Peak Context Window, Skill & Tool Usage, Subagent Delegation, and 4 hidden metrics) are computed directly from session data in the `sessions` table. Sessions do not need to be associated with a PR — all pushed session data is included in aggregate metrics.
- **Joined PR metrics** (Task Cycle Time) require a subquery joining `session_prs` to `sessions` to find the earliest session start time for each PR.
- **Special aggregate metrics** (PR Throughput) have no per-PR backing value and are computed as `merged_count / contributors / weeks` directly in `MetricsAggregator`.

Server-side computation is split between these services:

- **`MetricsComputer`** — Computes `ci_success_rate` (from per-commit `ci_passed` values on the `commits` table) and `line_revisit_rate` (7-day lookback). Only handles GitHub-derived metrics.
- **`SessionPrCorrelationService`** — Matches sessions to PRs by branch name and temporal overlap. Creates `SessionPr` join records only — does **not** compute or write session-derived metrics to `pr_metrics`.
- **`MetricsAggregator`** — Computes windowed aggregate metrics for the overview page. Handles four computation patterns:
  1. **Stored PR metrics** (`PR_METRIC_COLUMNS`) — reads pre-computed values from `pr_metrics` (post-open-commits, ci-success-rate, line-revisit-rate)
  2. **Computed PR expressions** (`COMPUTED_PR_EXPRESSIONS`) — evaluates SQL expressions per PR at query time (rubber-stamp-rate)
  3. **Task cycle time** — special join pattern: joins `session_prs → sessions` to compute hours from first session start to PR terminal date
  4. **PR throughput** — special aggregate: `merged_count / contributors / weeks`
  5. **Session metric expressions** (`SESSION_METRIC_EXPRESSIONS`) — evaluates SQL expressions per session row (all session-derived metrics including peak-context-pct, subagent-delegation, skill-tool-usage)
- **`PrsController#show`** — Computes session-derived metrics on-the-fly for the PR detail endpoint by aggregating across linked sessions (via `session_prs` join). Uses SQL expressions consistent with `MetricsAggregator` but aggregated per-PR (MAX for iteration_depth, SUM for `input_tokens + output_tokens`, weighted ratios for rates).
- **`MetricDetailComputer`** — Computes all data for the metric detail drill-down page for a single metric. Takes a metric slug, PR/session scopes, and window days. Returns: `{ count, total_count, stats (avg/P10/P50/P90), prior_stats, trend (daily buckets with avg/min/max/count), distribution (histogram buckets), notable_highest, notable_lowest }`. Handles stored PR metrics, computed PR expressions, joined PR metrics (task cycle time), special aggregates (PR throughput), and session-derived metrics. Exposed via `metric_detail` controller actions at org, me, team, and repo scopes.
- **`SessionSerialization`** — Computes per-session metric values via SQL aliases for the session list endpoints. Each session response includes a `metrics` object with all session-derived metric values (including peak_context_pct, subagent_delegation, skill_tool_usage).

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

Query-time metrics (rubber-stamp-rate, task-cycle-time, pr-throughput) are also not stored — they are computed at query time from `prs` table data and session joins.

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

### Computed PR metrics — query-time
Rubber Stamp Rate is computed at query time from `prs` table columns (`additions`, `deletions`, `merged_at`, `created_at_source`). Task Cycle Time is computed via a join to `session_prs` and `sessions`. PR Throughput is a pure aggregate. None of these are stored.

### Session metrics — computed on-the-fly
The session-derived metrics (iteration_depth, total_tokens, cache_hit_rate, sidechain_rate, re_read_rate, autonomy_score, peak_context_pct, subagent_delegation, skill_tool_usage) are **not** persisted in `pr_metrics`. They are computed at query time from raw session data in the `sessions` table using SQL expressions. Peak context percentage is pre-computed by the CLI (stored as `peak_context_pct` on `sessions`), while subagent delegation and skill/tool usage are computed from the tool call count columns (`agent_tool_calls`, `skill_tool_calls`, `mcp_tool_calls`, `total_tool_calls`). This approach:
- Avoids write contention on the `pr_metrics` table from late-arriving session data
- Ensures session metrics are always up-to-date when new sessions are pushed
- Allows aggregate session metrics to include sessions not associated with any PR

See [Data Model](data-model.md) for full schema.
