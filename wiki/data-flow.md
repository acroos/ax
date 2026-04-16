# Data Flow

This page traces data from raw sources to displayed metrics. There are three data sources, each with a distinct role:

- **GitHub API** — Source of truth for PR data. Provides complete historical picture on demand.
- **GitHub Webhooks** — Real-time update channel. Keeps data fresh after initial backfill.
- **CLI Push** — Session enrichment. Adds AI-specific metrics (cost, messages, turns) to PRs.

## CLI Push (`ax push`)

The CLI parses Claude Code session data locally and pushes it to the server.

```
Step 1: Parse Sessions
  ~/.claude/projects/ → SessionParser → token counts, costs, tool calls, branches

Step 2: Identify Repo
  git remote get-url origin → owner/repo

Step 3: Push to Server
  Build PushPayload with sessions → POST /api/v1/push → Rails API

Step 4: Post-Push (server-side)
  If repo has GitHub App → enqueue BackfillRepoJob (fetches PRs from GitHub API)
  Always → run SessionPrCorrelationService (match sessions to PRs by branch)
```

This runs automatically via the SessionEnd hook installed by `ax init`, or manually via `ax push --repo .`.

## GitHub App Backfill

When a GitHub App is installed or repos are added, the server immediately fetches historical PR data from the GitHub API. This is the primary source of PR records.

```
GitHub App Installed
  → BackfillInstallationJob
    → For each repo: enqueue BackfillRepoJob

BackfillRepoJob (per-repo, idempotent):
  → Fetch PRs from GitHub API (last 90 days, configurable)
  → For each PR:
    → Create/update PR record (PrOpened handler)
    → Fetch reviews → capture review cycle time
    → If merged/closed: fetch files + commits, compute metrics, settle
  → Run SessionPrCorrelationService (match existing sessions to PRs)
```

Backfill is also triggered by:
- `ax push` (if repo has GitHub App linked)
- `installation_repositories.added` webhook (new repos added to App)
- Daily reconciliation job (`ReconcileReposJob` at 3am)

## Webhook Ingestion (Rails Server)

Real-time path for PR events. GitHub sends events directly to the server after App installation.

```
GitHub Event → POST /webhooks/github → Validate HMAC-SHA256 signature
  → Enqueue ProcessGitHubWebhookJob (async)
  → Route to handler by event type:

  pull_request.opened       → Create PR, initialize empty metrics
                              → Run SessionPrCorrelationService
  pull_request.synchronize  → Update post_open_commits
  pull_request.closed       → Fetch file/commit data from GitHub API
                              → Compute line_revisit_rate, ci_success_rate
                              → Settle metrics (merged or abandoned)
  pull_request_review       → Capture first review cycle time (human reviews only)
  check_suite.completed     → Update ci_success_rate
```

Webhooks are an optimization on top of API backfill. If a webhook is missed, the daily reconciliation job catches the drift.

See: [Rails Server — Webhook Handling](rails-server.md#webhook-handling)

## Metric Lifecycle

```
PR created (via backfill or webhook)
  → PrMetrics initialized
  → GitHub-derived metrics updated as data arrives (webhooks + backfill)
  → Session-derived metrics updated when sessions are correlated (push)
  → PR reaches terminal state (merged or closed)
  → GitHub metrics settled: metrics_finalized = true, finalized_at = timestamp
  → GitHub-derived fields locked; session-derived fields remain updatable
```

All PRs are shown in the dashboard regardless of settlement status. Open PRs show partial metrics with a "pending" indicator. Aggregate metrics (averages, trend lines) use settled PRs only for accuracy.

### Scoped Write Protection

`PrMetrics` has two field categories with different protection rules:

- **GitHub-derived** (locked after settlement): `post_open_commits`, `line_revisit_rate`, `first_review_at`, `review_cycle_time_minutes`
- **Session-derived** (always updatable via `update_session_metrics!`): `iteration_depth`, `token_cost_usd`, `cache_hit_rate`, `sidechain_rate`, `re_read_rate`, `autonomy_score`

This allows late-arriving session data to enrich already-settled PRs, which is the normal case (developers push after PRs merge).

See: [Metrics — Settlement](metrics.md#finalization)

## Session-to-PR Correlation

The server correlates sessions to PRs using branch matching within the same repo.

```
SessionPrCorrelationService:
  → Find all sessions for the repo with a non-null branch
  → Find all PRs for the repo with a non-null branch
  → Match by branch name → create SessionPr records (confidence: "branch_match")
  → Aggregate session metrics onto matched PRs:
    token_cost_usd  = SUM(session.total_cost_usd)
    iteration_depth = MAX(session.turn_count)
    cache_hit_rate, sidechain_rate, re_read_rate, autonomy_score via MetricsComputer
```

Correlation runs after: CLI push, GitHub App backfill, PR opened webhook.

## Repo Identity

Repos are identified canonically by `(organization_id, github_owner, github_repo)`. The `path` field (local filesystem path) is informational and non-unique — different developers have different local paths for the same repo.

When `ax push` arrives, the server looks up the repo by `github_owner + github_repo` within the user's orgs, falling back to `path` for legacy compatibility.

## Periodic Reconciliation

`ReconcileReposJob` runs daily (3am) and enqueues `BackfillRepoJob` for every repo with an active GitHub App. This is the self-healing layer: catches missed webhooks, state drift, and ensures the system converges to GitHub's truth.

## Display Path

```
PostgreSQL → Rails API (org-scoped) → fetch() with session token → Next.js server component → rendered page
```

The dashboard's data layer (`dashboard/src/lib/db.ts`) provides async functions that fetch from the Rails API. All data endpoints are org-scoped. PR list endpoints return all PRs; aggregate endpoints filter to settled PRs only. The overview aggregate endpoint (`/metrics`) windows to the last 7 days and returns per-metric `{ current, prior, sparkline }` for trend visualization and week-over-week deltas.

See: [Dashboard — Data Layer](dashboard.md#data-layer)
