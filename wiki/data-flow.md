# Data Flow

This page traces data from raw sources to displayed metrics. There are three data sources, each with a distinct role:

- **GitHub API / GitLab API** — Source of truth for PR/MR data. Provides complete historical picture on demand.
- **GitHub Webhooks / GitLab Webhooks** — Real-time update channel. Keeps data fresh after initial backfill.
- **CLI Push** — Session enrichment. Adds AI-specific metrics (cost, messages, turns) to PRs.

## CLI Push (`ax push`)

The CLI parses Claude Code session data locally and pushes it to the server.

```
Step 1: Parse Sessions
  ~/.claude/projects/ → SessionParser →
    token counts, costs, tool calls (categorized: Agent/Skill/MCP), branches,
    peak context tokens, model-specific context limit → peak_context_pct

Step 2: Identify Repo
  git remote get-url origin → owner/repo

Step 3: Push to Server
  Build PushPayload with sessions → POST /api/v1/push → Rails API
  Payload includes: peak_context_pct, total_tool_calls, agent_tool_calls,
  skill_tool_calls, mcp_tool_calls (in addition to existing fields)

Step 4: Post-Push (server-side)
  If repo has GitHub App → enqueue BackfillRepoJob (fetches PRs from GitHub API)
  Else if repo has GitLab connection → enqueue BackfillGitlabRepoJob (fetches MRs from GitLab API)
  Else → run SessionPrCorrelationService (match sessions to PRs by branch)
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
  check_suite.completed     → Update per-commit ci_passed, recompute ci_success_rate
                              (uses commit.pr association, not webhook payload)
```

Webhooks are an optimization on top of API backfill. If a webhook is missed, the daily reconciliation job catches the drift.

See: [Rails Server — Webhook Handling](rails-server.md#webhook-handling)

## GitLab Webhook Ingestion

Real-time path for MR events. GitLab sends per-project webhook events after connection setup.

```
GitLab Event → POST /webhooks/gitlab → Validate X-Gitlab-Token header
  → Enqueue ProcessGitLabWebhookJob (async)
  → Route to handler by object_kind + action:

  merge_request action=open     → Create PR (iid as number), initialize metrics
                                → Run SessionPrCorrelationService
  merge_request action=update   → Update post_open_commits
  merge_request action=merge    → Fetch file/commit data from GitLab API
                                → Compute metrics, finalize (merged)
  merge_request action=close    → Fetch file/commit data from GitLab API
                                → Compute metrics, finalize (closed)
  pipeline status=success/failed → Update per-commit ci_passed, recompute ci_success_rate
```

GitLab webhooks use the same deduplication pattern as GitHub (`processed_gitlab_events` table, `X-Gitlab-Event-UUID` header).

## GitLab Connection Backfill

When a GitLab connection is established, the server fetches historical MR data.

```
GitLab Connected
  → BackfillConnectionJob
    → List accessible projects via GitLab API
    → Upsert Repo records (platform: "gitlab")
    → Create per-project webhooks
    → For each repo: enqueue BackfillGitlabRepoJob

BackfillGitlabRepoJob (per-repo, idempotent):
  → Fetch MRs from GitLab API (last 90 days)
  → Translate MR data to PR format
  → Reuse webhook handlers (MrMerged, MrClosed) for finalization
  → Run SessionPrCorrelationService
```

## Metric Lifecycle

```
PR created (via backfill or webhook)
  → PrMetrics initialized (GitHub-derived fields only)
  → GitHub-derived metrics updated as data arrives (webhooks + backfill)
  → PR reaches terminal state (merged or closed)
  → GitHub metrics settled: metrics_finalized = true, finalized_at = timestamp
  → GitHub-derived fields locked
```

All PRs are shown in the dashboard regardless of settlement status. Open PRs show partial metrics with a "pending" indicator. PR-derived aggregate metrics (averages, trend lines) use settled PRs only for accuracy. Session-derived aggregate metrics are computed directly from the `sessions` table (via `MetricsAggregator` SQL expressions) and do not require PR association — all pushed session data appears in the dashboard.

### Write Protection

`PrMetrics` only stores GitHub-derived fields. These are locked after settlement (`metrics_finalized = true`): `post_open_commits`, `line_revisit_rate`. `ci_success_rate` remains updatable after finalization for late-arriving CI results.

Session-derived metrics are no longer stored on `pr_metrics`. They are computed on-the-fly from the `sessions` table — either per-session (via session list endpoints) or aggregated across linked sessions (via the PR detail endpoint). New session fields (`peak_context_pct`, tool call counts) support the Peak Context Window, Subagent Delegation, and Skill & Tool Usage metrics.

Query-time PR metrics (Rubber Stamp Rate, Task Cycle Time, PR Throughput) are computed at query time from `prs` table columns and session joins — they are not stored on `pr_metrics` either.

See: [Metrics — Settlement](metrics.md#finalization)

## Session-to-PR Correlation

The server correlates sessions to PRs using branch matching and temporal overlap within the same repo.

```
SessionPrCorrelationService:
  → Find all sessions for the repo with a non-null branch
  → Find all PRs for the repo with a non-null branch
  → Match by branch name + temporal overlap → create SessionPr records (confidence: "branch_match")
```

The service only creates `SessionPr` join records — it does **not** compute or write session-derived metrics to `pr_metrics`. Session metrics are computed on-the-fly: per-PR aggregates are computed by `PrsController#show`, and dashboard-wide aggregates by `MetricsAggregator` directly from the `sessions` table.

Correlation runs after: CLI push, GitHub App backfill, PR opened webhook.

## Repo Identity

Repos are identified canonically by `(organization_id, platform, platform_owner, platform_repo)`. The `path` field (local filesystem path) is informational and non-unique — different developers have different local paths for the same repo.

When `ax push` arrives, the server looks up the repo by `platform + platform_owner + platform_repo` within the user's orgs, falling back to `path` for legacy compatibility. The `platform` field defaults to `"github"` and is set to `"gitlab"` for GitLab repos.

## Periodic Reconciliation

`ReconcileReposJob` runs daily (3am) and enqueues `BackfillRepoJob` for every repo with an active GitHub App, and `BackfillGitlabRepoJob` for every repo with an active GitLab connection. This is the self-healing layer: catches missed webhooks, state drift, and ensures the system converges to the platform's truth.

`ReconcileCiDataJob` runs every 6 hours and fills CI data gaps that the general backfill can't reach (since finalized PRs are skipped by `BackfillRepoJob`). It does two things:

1. **Backfills missing CI status** — finds commits with `ci_passed = nil` on finalized PRs, re-fetches check suite results from the GitHub API, and sets `ci_passed` for any completed suites
2. **Recomputes stale rates** — finds finalized PRs with `ci_success_rate = nil` where commits now have `ci_passed` data (filled by webhooks or the backfill above), and recomputes the metric

## Display Path

```
PostgreSQL → Rails API (org-scoped) → fetch() with session token → Next.js server component → rendered page
```

The dashboard's data layer (`dashboard/src/lib/db.ts`) provides async functions that fetch from the Rails API. All data endpoints are org-scoped. PR list endpoints return all PRs; the aggregate `/metrics` endpoint returns PR-derived metrics from settled PRs and session-derived metrics from all sessions (regardless of PR association). Separate session list endpoints (`/sessions`, `/me/sessions`, `/teams/:slug/sessions`, `/repos/:id/sessions`) return individual sessions with per-session computed metrics. Metric detail pages use the session list endpoints for session-derived metrics (showing "X sessions with data") and PR list endpoints for PR-derived metrics. The aggregate response includes `totalPRs`, `totalSessions`, and per-metric `{ current, prior, sparkline }` for trend visualization and period-over-period deltas. The window defaults to 30 days (configurable to 7 or 90).

See: [Dashboard — Data Layer](dashboard.md#data-layer)
