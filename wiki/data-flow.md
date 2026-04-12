# Data Flow

This page traces data from raw sources to displayed metrics. There are three ingestion paths: full sync (CLI), background polling (CLI), and webhooks (server).

## Full Sync (`ax sync`)

The primary ingestion path. Runs locally via the CLI.

```
Step 1: Parse Sources
  git log/diff/blame  →  GitParser    →  commits, diffs, branches, remote URL
  gh pr list/view     →  GitHubParser →  PRs, reviews, CI checks, PR commits
  ~/.claude/projects/ →  SessionParser →  token counts, costs, tool calls, branches

Step 2: Store Raw Data
  Upsert repo → Upsert PRs → Store commits (with claude-authored flags) → Store sessions

Step 3: Correlate Sessions to PRs
  For each session, try (in order):
    1. Direct match  — PR URL found in session output
    2. Branch match  — Session branch == PR head branch
    3. Commit match  — Session commit SHAs found in PR
    4. Heuristic     — Time-window overlap (fallback)
  Result: session_prs join records with confidence levels

Step 4: Compute Metrics
  Phase 1 (GitHub-sourced):
    post_open_commits, first_pass_accepted, ci_success_rate,
    has_tests, diff_churn_lines, line_revisit_rate

  Phase 2 (Session-dependent, weighted by correlation count):
    messages_per_pr, iteration_depth, token_cost_usd,
    self_correction_rate, context_efficiency, error_recovery_attempts

  Phase 3 (Plan analysis):
    plan_coverage_score, plan_deviation_score, scope_creep_detected

Step 5: Finalize
  For each terminal PR (merged or closed):
    Set metrics_finalized = true, finalized_at = CURRENT_TIMESTAMP
  Compute repo-level: unmerged_token_spend

Step 6: Push (if team mode)
  Extract all data → POST /api/v1/push → Rails stores in PostgreSQL
```

Orchestrated by `internal/sync/sync.go`. Each step is idempotent — re-running sync is safe due to upsert-based writes.

## Background Polling (`ax watch`)

Lightweight path that only checks GitHub for PR state changes. Does not re-parse sessions.

```
For each watched repo:
  Fetch PR list from GitHub
  For each PR that transitioned to terminal state:
    Fetch reviews, checks, commits
    Compute Phase 1 metrics
    Finalize PR
  Recompute unmerged token spend
```

Runs as a foreground process (`ax watch`), single cycle (`ax watch --once`), or system job (`ax watch install` → launchd on macOS, cron on Linux).

See: [Go CLI — Watch System](go-cli.md#watch-system)

## Webhook Ingestion (Rails Server)

Real-time path for managed mode. GitHub sends events directly to the server.

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
PR opened → metrics initialized (all null)
  ↓
Commits pushed → post_open_commits updated
Reviews posted → first_pass_accepted updated
CI runs        → ci_success_rate updated
  ↓
PR merged/closed → ALL metrics finalized (immutable)
  ↓
Open PRs are never shown in reports or dashboard
```

Once finalized, metrics are write-protected. The `PrMetrics` model in Rails has a callback that prevents updates to finalized records. In SQLite, the CLI checks `metrics_finalized` before writing.

See: [Metrics — Finalization](metrics.md#finalization)

## Display Path

```
PostgreSQL → Rails API (org-scoped) → fetch() with session token → Next.js server component → rendered page
```

The dashboard's data layer (`dashboard/src/lib/db.ts`) provides async functions that fetch from the Rails API. All data endpoints are org-scoped.

See: [Dashboard — Data Layer](dashboard.md#data-layer)
