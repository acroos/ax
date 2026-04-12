# Data Flow

This page traces data from raw sources to displayed metrics. There are two ingestion paths: CLI push (session data) and webhooks (PR events).

## CLI Push (`ax push`)

The CLI parses Claude Code session data locally and pushes it to the server.

```
Step 1: Parse Sessions
  ~/.claude/projects/ → SessionParser → token counts, costs, tool calls, branches

Step 2: Identify Repo
  git remote get-url origin → owner/repo

Step 3: Push to Server
  Build PushPayload with sessions → POST /api/v1/push → Rails API
```

This runs automatically via the SessionEnd hook installed by `ax init`, or manually via `ax push --repo .`.

## Webhook Ingestion (Rails Server)

Real-time path for PR events. GitHub sends events directly to the server.

```
GitHub Event → POST /webhooks/github → Validate HMAC-SHA256 signature
  → Enqueue ProcessGitHubWebhookJob (async)
  → Route to handler by event type:

  pull_request.opened       → Create PR, initialize empty metrics
  pull_request.synchronize  → Update post_open_commits
  pull_request.closed       → Fetch file/commit data from GitHub API
                              → Compute diff_churn, has_tests, line_revisit_rate
                              → Finalize metrics (merged or abandoned)
  pull_request_review       → Update first_pass_accepted
  check_suite.completed     → Update ci_success_rate
```

At finalization (merge/close), the server fetches file-level data from the GitHub API via `GithubDataFetcher`, then computes output quality metrics via `MetricsComputer`. This avoids unnecessary API calls for WIP PRs. Session-dependent metrics come from CLI push.

See: [Rails Server — Webhook Handling](rails-server.md#webhook-handling)

## Metric Lifecycle

```
PR opened
  → metrics initialized (all null)
  → individual metrics updated as data arrives (webhooks + push)
  → PR reaches terminal state (merged or closed)
  → ALL metrics finalized: metrics_finalized = true, finalized_at = timestamp
  → Record becomes immutable
```

Open PRs are never shown in reports or dashboard.

Once finalized, metrics are write-protected. The `PrMetrics` model in Rails has a callback that prevents updates to finalized records.

See: [Metrics — Finalization](metrics.md#finalization)

## Session-to-PR Correlation

The server correlates pushed session data to PRs using strategies including:
1. **Direct** — PR URL appears in session output
2. **Branch** — Session's working branch matches PR head branch
3. **Commit** — Commit SHAs from the session appear in the PR

A single session can correlate to multiple PRs. Metrics are weighted inversely by correlation count.

## Display Path

```
PostgreSQL → Rails API (org-scoped) → fetch() with session token → Next.js server component → rendered page
```

The dashboard's data layer (`dashboard/src/lib/db.ts`) provides async functions that fetch from the Rails API. All data endpoints are org-scoped.

See: [Dashboard — Data Layer](dashboard.md#data-layer)
