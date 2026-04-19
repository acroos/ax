# Rails Server

The Rails API powers the managed service at `ax.up.railway.app`. It stores data from multiple developer CLIs, processes GitHub webhooks in real time, and serves data to the dashboard via org-scoped endpoints.

Location: `server/`

## Models

### Identity & Organization

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `users` | GitHub OAuth identity (github_id, username, email, avatar) |
| `Organization` | `organizations` | Team container (slug, name, is_personal) |
| `OrgMembership` | `org_memberships` | User-org join with role (owner, admin, member) |
| `GitHubInstallation` | `github_installations` | GitHub App installation per org |
| `Team` | `teams` | Team within an org (name, slug, optional parent_team) |
| `TeamMembership` | `team_memberships` | Org-membership-to-team join (validates org match) |

Every user gets a personal org on first login. Non-personal orgs require an approved waitlist entry.

Organization slugs are validated for uniqueness and exclude reserved words (admin, api, app, auth, login, settings, etc.).

### Authentication

| Model | Table | Purpose |
|-------|-------|---------|
| `ApiKey` | `api_keys` | CLI auth token (prefix: `ax_k1_`, bcrypt hashed) |
| `UserSession` | `user_sessions` | Dashboard session token (30-day expiry) |
| `Invite` | `invites` | Org invitation with token (7-day expiry) |

See [Authentication](authentication.md) for how these are used across modes.

### Data

| Model | Table | Purpose |
|-------|-------|---------|
| `Repo` | `repos` | Repository (path, remote_url, github_owner, github_repo, org_id) |
| `PrFile` | `pr_files` | File paths per PR (fetched from GitHub API at finalization) |
| `PR` | `prs` | Pull request (number, state, branch, timestamps, diff stats) |
| `Commit` | `commits` | Git commit (sha as PK, claude-authored flag, post-open flag) |
| `CodingSession` | `sessions` | Claude Code session (tokens, cost, model, message counts) |
| `SessionPr` | `session_prs` | Session-to-PR correlation with confidence |
| `PrMetrics` | `pr_metrics` | 10 PR-level metrics (with finalization lock) |
| `RepoMetrics` | `repo_metrics` | Repo-level aggregates (unmerged spend, totals) |
| `WatchedRepo` | `watched_repos` | Polling metadata |

### Key Model Behaviors

**PrFile** stores file paths fetched from the GitHub API at PR finalization. Used by server-side metric computation (line_revisit_rate).

**PrMetrics** has a `before_update` callback (`prevent_settled_github_update`) that blocks changes to GitHub-derived fields once `metrics_finalized = true`. Session-derived fields (token_cost_usd, iteration_depth, cache_hit_rate, etc.) remain updatable via `update_session_metrics!` to support late-arriving session data.

**User** automatically processes pending invites on creation — if someone was invited by GitHub username before they signed up, the invite is accepted on first login.

**Team** belongs to an organization with an optional parent team (self-referential FK). Child teams cascade-delete with their parent. Key methods: `descendant_team_ids` (recursive CTE for the full subtree), `member_github_usernames` (all members including descendants), `direct_member_count`. TeamMembership links to `OrgMembership` (not User directly) and validates the org matches. Organization has_many :teams, OrgMembership has_many :team_memberships/:teams, User has `teams_in(org)`.

**Repo** is identified canonically by `(organization_id, github_owner, github_repo)`. The `path` field is informational and non-unique. PushService looks up repos by `github_owner/github_repo` within the user's orgs, falling back to `path` for legacy compatibility. On first push, repos are auto-assigned to the user's personal org.

## API Endpoints

### Push (CLI Authentication — API Key)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/push` | Receive repo/PR/session/metrics data from CLI (10MB limit) |
| `GET` | `/api/v1/watch-status` | Watched repos list for CLI |

### Read (Dashboard Authentication — Session Token)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/orgs` | List user's organizations |
| `POST` | `/api/v1/orgs` | Create organization (requires approved waitlist) |
| `GET` | `/api/v1/orgs/:slug` | Org details |
| `GET` | `/api/v1/orgs/:slug/repos` | List org repos |
| `GET` | `/api/v1/prs/:id` | Single PR with metrics (access-checked via org membership + `history_days` cutoff) |
| `GET` | `/api/v1/orgs/:slug/prs` | All PRs across all org repos (settled + open) |
| `GET` | `/api/v1/orgs/:slug/metrics` | Windowed aggregate metrics (7-day current + prior) with daily sparkline buckets. Returns `{ totalPRs, sessionDataCount, metrics: { [slug]: { current, prior, sparkline } } }` via `MetricsAggregator`. |
| `GET` | `/api/v1/orgs/:slug/repos/:id/prs` | All PRs with available metrics |
| `GET` | `/api/v1/orgs/:slug/repos/:id/metrics` | Windowed aggregate metrics (same shape as org-level) plus repo-level fields (`unmergedCostUSD`, `totalCostUSD`, `unmergedRate`) |
| `GET` | `/api/v1/orgs/:slug/repos/:id/timeline` | PR timeline for trend charts |
| `GET` | `/api/v1/orgs/:slug/repos/:id/repo-metrics` | Repo-level metrics (unmerged spend) |

### Org Management (Session Token, Admin Required)

| Method | Path | Purpose |
|--------|------|---------|
| `GET/PUT/DELETE` | `/api/v1/orgs/:slug/members[/:id]` | List, update role, remove members |
| `GET/POST/DELETE` | `/api/v1/orgs/:slug/invites[/:id]` | List, create, revoke invites |
| `POST` | `/api/v1/invites/:token/accept` | Accept an invite (403 if org at member limit) |

### Teams (Session Token, Pro Plan Required)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/orgs/:slug/teams` | List teams (admins see all, members see only their teams) |
| `POST` | `/api/v1/orgs/:slug/teams` | Create team (admin only) |
| `GET` | `/api/v1/orgs/:slug/teams/:team_slug` | Team detail |
| `PUT` | `/api/v1/orgs/:slug/teams/:team_slug` | Update team (admin only) |
| `DELETE` | `/api/v1/orgs/:slug/teams/:team_slug` | Destroy with cascade (admin only) |
| `GET` | `/api/v1/orgs/:slug/teams/:team_slug/prs` | Team-scoped PRs (by member GitHub usernames) |
| `GET` | `/api/v1/orgs/:slug/teams/:team_slug/metrics` | Team-scoped metrics (reuses MetricsAggregator) |
| `GET` | `/api/v1/orgs/:slug/teams/:team_slug/members` | List members (admin only) |
| `POST` | `/api/v1/orgs/:slug/teams/:team_slug/members` | Add member (admin only) |
| `DELETE` | `/api/v1/orgs/:slug/teams/:team_slug/members/:id` | Remove member (admin only) |

Teams are gated by the `teams` plan capability (free: false, pro: true). Regular members can only access teams they belong to; admins can see and manage all teams. Team-scoped PR and metric endpoints filter by the GitHub usernames of all team members (including descendants for hierarchical teams).

### GitHub App Installation (Session Token, Admin Required for Install)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/orgs/:slug/github_installation` | Current installation state + user role |
| `POST` | `/api/v1/orgs/:slug/github_installation/install_url` | Generate signed GitHub App install URL (admin-only) |
| `GET` | `/github/installations/callback` | GitHub App setup callback (state-token auth, not session) |

### Auth

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/users/auth/github` | Initiate GitHub OAuth |
| `GET` | `/users/auth/github/callback` | OAuth callback → create user, generate session |
| `GET` | `/auth/me` | Current user info + orgs |
| `POST` | `/auth/logout` | Destroy session |
| `GET` | `/api/v1/api_key` | View API key metadata |
| `POST` | `/api/v1/api_key/rotate` | Rotate CLI API key (returns raw key once) |
| `GET` | `/api/v1/api_key/reveal` | One-time read of raw API key from cache |

### Billing (Session Token, Admin Required for Mutations)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/orgs/:slug/billing` | Plan details, subscription status (incl. `quantity` and `seat_price_cents`), usage counts (any member) |
| `POST` | `/api/v1/orgs/:slug/billing/checkout` | Create Stripe Checkout session, return URL (admin only). Refuses if a Stripe-side `active`/`trialing`/`past_due` subscription already exists on the customer, even if the local `Subscription` row hasn't been written yet. |
| `POST` | `/api/v1/orgs/:slug/billing/portal` | Create Stripe Customer Portal session, return URL (admin only) |
| `POST` | `/api/v1/orgs/:slug/billing/reconcile?session_id=…` | Synchronously upsert local Subscription/plan from a Stripe Checkout Session (admin only). Called by the dashboard success route so the UI doesn't depend on webhook timing. Idempotent with the `checkout.session.completed` webhook. |

### Webhooks

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/webhooks/github` | GitHub webhook receiver (HMAC validated) |
| `POST` | `/webhooks/stripe` | Stripe webhook receiver (Stripe signature validated) |

### Other

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/waitlist` | Add email to waitlist |
| `GET` | `/up` | Health check |

## Services

### PushService (`app/services/push_service.rb`)
Main ingestion orchestrator. Called by the push controller.

1. Upserts repo by `github_owner/github_repo` (canonical lookup, falls back to path)
2. Validates user is member of repo's org
3. Upserts PRs, sessions, commits, correlations, metrics — all in a transaction
4. Skips updates to already-finalized PR metrics
5. Returns entity count hash
6. Post-transaction: triggers `BackfillRepoJob` if repo has GitHub App, otherwise runs `SessionPrCorrelationService`

### SessionPrCorrelationService (`app/services/session_pr_correlation_service.rb`)
Matches sessions to PRs within a repo by branch name, then computes session-derived metrics.

1. Finds all sessions and PRs for the repo with non-null branches
2. Matches by branch name → creates `SessionPr` records (confidence: `"branch_match"`)
3. For each PR with linked sessions: aggregates `token_cost_usd` and `iteration_depth`, plus derived metrics (`cache_hit_rate`, `sidechain_rate`, `re_read_rate`, `autonomy_score`) via MetricsComputer
4. Uses `update_session_metrics!` to enrich even settled PRs
5. Idempotent — safe to run repeatedly

### AuthService (`app/services/auth_service.rb`)
Handles OAuth and onboarding:
- `find_or_create_from_github(auth_hash)` — Creates/updates user, personal org, API key
- `process_pending_invites(user)` — Auto-accepts invites matching the user's GitHub username (silently skips invites where the org has reached its member limit)
- `ensure_can_create_org!(user)` — Checks waitlist approval

### GithubDataFetcher (`app/services/github_data_fetcher.rb`)
Fetches file-level and commit data from the GitHub API at PR finalization:
- `GET /repos/{owner}/{repo}/pulls/{number}/files` → PrFile records (for line revisit tracking)
- `GET /repos/{owner}/{repo}/pulls/{number}/commits` → Commit records with per-commit additions

Also computes and updates the PR's `additions`, `deletions`, and `changed_files` from the fetched file data (the GitHub list endpoint doesn't include diff stats).

Only runs if the repo has a GitHub App installation. Skips gracefully otherwise.

### MetricsAggregator (`app/services/metrics_aggregator.rb`)
Computes windowed aggregate metrics for the overview page. Used by both `OrganizationsController#metrics` and `ReposController#metrics`.

1. Takes a `PrMetrics` scope (pre-filtered to org/repo + `metrics_finalized: true`)
2. Splits into current window (last 7 days by `finalized_at`) and prior window (7 days before that)
3. Computes `AVG` for all 9 PR-level metrics in each window
4. Builds daily sparkline buckets via `DATE(finalized_at)` grouping within the current window
5. Returns `{ totalPRs, sessionDataCount, metrics: { [slug]: { current, prior, sparkline: [{t, v}] } } }`

Metric slug → column mapping is maintained in `METRIC_COLUMNS`. Empty days in the sparkline are null (the dashboard renders gaps). Empty prior window returns null for `prior` (dashboard suppresses the delta).

MetricsAggregator is also used by `TeamsController#metrics` with a PR scope filtered to team members' GitHub usernames.

### MetricsComputer (`app/services/metrics_computer.rb`)
Computes metrics derived from fetched data and correlated sessions:
- `ci_success_rate`: fraction of commits with `ci_passed = true`
- `line_revisit_rate`: fraction of files also changed in other finalized PRs in the same repo (7-day lookback)
- `cache_hit_rate`, `sidechain_rate`, `re_read_rate`, `autonomy_score`: computed from correlated session aggregates

Called by PrMerged and PrClosed handlers after GithubDataFetcher populates the data.

### OrgService (`app/services/org_service.rb`)
Creates orgs, assigns owner membership, marks waitlist entry as "joined".

### PlanService (`app/services/plan_service.rb`)
Config-driven capability enforcement. Provides a unified API for checking plan capabilities.

- `PlanService.for(org)` — Constructor, loads plan config and org overrides
- `capability(key)` — Returns effective value (plan default merged with org's `plan_overrides`)
- `can?(key)` — Boolean check (is capability truthy?)
- `within_limit?(key, count)` — Numeric check (is count under limit?)
- `plan_details` — Serializable hash for API responses

Plan definitions live in `config/initializers/plans.rb` as a frozen `PLANS` constant. Per-org overrides (stored in `organizations.plan_overrides` jsonb column) merge on top of plan defaults.

Capabilities include `history_days` (free: 30, pro: unlimited) — controls how far back users can view PR data. The `history_cutoff` helper in `BaseController` converts this to a cutoff timestamp for date comparisons.

**Seat-based `max_members` for Pro:** While `plans.rb` declares `max_members: Float::INFINITY` for Pro, the runtime value comes from `subscription.quantity` when the org has an active or trialing subscription. `plan_overrides` still take precedence for manual carve-outs.

### StripeService (`app/services/stripe_service.rb`)
Wraps Stripe API calls for billing operations (class methods):

- `find_or_create_customer(org)` — Creates Stripe customer or retrieves existing (uses `with_lock` for concurrency safety)
- `create_checkout_session(org, success_url:, cancel_url:)` — Creates Stripe Checkout session for Pro upgrade. Initial seat quantity equals the org's current member count (minimum 1).
- `create_portal_session(org, return_url:)` — Creates Stripe Customer Portal session for self-service billing management
- `update_seat_count(subscription, new_quantity, proration_behavior:)` — Updates the Stripe `SubscriptionItem` quantity and syncs the local `Subscription.quantity`. Use `"create_prorations"` for increases and `"none"` for decreases.

### SeatService (`app/services/seat_service.rb`)
Orchestrates seat changes in sync with membership changes. No-ops when the org has no active subscription (free plan).

- `add_seat!(org)` — Increments seat quantity by 1 (with prorations). Called BEFORE membership creation so a Stripe failure rolls back the membership.
- `remove_seat!(org)` — Decrements seat quantity by 1 (minimum 1, no proration). Called AFTER membership deletion so a Stripe failure doesn't block the removal — the `customer.subscription.updated` webhook will eventually reconcile.

### Stripe Webhook Handlers (`app/services/stripe_handlers/`)
Process Stripe webhook events (same pattern as GitHub handlers). `ProcessStripeWebhookJob` deduplicates via the `processed_stripe_events` table — a single `INSERT ... ON CONFLICT DO NOTHING` on `event_id` ensures each Stripe event is processed exactly once, even across retries or concurrent jobs.

| Handler | Event | Action |
|---------|-------|--------|
| `CheckoutCompleted` | `checkout.session.completed` | Create Subscription (with `stripe_subscription_item_id` and `quantity`), set org plan to "pro". Skips entirely if the Stripe sub is already canceled (e.g., a delayed redelivery after manual cleanup). Reused by `BillingController#reconcile` for the synchronous upgrade path. |
| `SubscriptionUpdated` | `customer.subscription.updated` | Sync status/period/quantity, update org plan based on status. Quantity changes from seat add/remove flow through here. |
| `SubscriptionDeleted` | `customer.subscription.deleted` | Mark canceled, revert org plan to "free" |
| `InvoicePaymentFailed` | `invoice.payment_failed` | Log warning (hook point for notifications) |

The Stripe API version is pinned in `config/initializers/stripe.rb` (default `2026-03-25.dahlia`, overridable via `STRIPE_API_VERSION`). Keep this in sync with the version configured on the Stripe dashboard webhook endpoint. Bumping it requires reviewing every Stripe object access in these handlers — for example, `current_period_start` / `current_period_end` were moved off `Subscription` onto each subscription item in `2025-04-30.basil`.

## Concerns

### PrSerialization (`app/controllers/concerns/pr_serialization.rb`)
Extracted shared PR JSON serialization logic used by `OrganizationsController`, `ReposController`, and `TeamsController`. Provides `serialize_prs_with_metrics(prs)` to avoid duplicating the PR-to-JSON mapping across controllers.

## Authorization — Team Helpers

`BaseController` provides team-related authorization helpers:

- `find_team!` — Looks up team by slug within the current org. Members can only access teams they belong to; admins can access all teams.
- `find_team_as_admin!` — Same lookup but requires admin role.
- `team_member?` — Checks if the current user is a member of the given team.
- `require_teams_feature!` — Before-action guard that returns 403 if the org's plan does not include the `teams` capability.

## Webhook Handling

GitHub webhooks arrive at `POST /webhooks/github`. The controller validates the `X-Hub-Signature-256` header using per-installation webhook secrets (falling back to `GITHUB_APP_WEBHOOK_SECRET` or `AX_WEBHOOK_GITHUB_SECRET`), then enqueues `ProcessGitHubWebhookJob` for async processing.

### Signature Validation

The `resolve_webhook_secret` method in `WebhooksController`:
1. Parses the payload to extract `installation.id`
2. Looks up the `GithubInstallation` and uses its `webhook_secret` if present
3. Falls back to `GITHUB_APP_WEBHOOK_SECRET` env var, then `AX_WEBHOOK_GITHUB_SECRET`

### Handlers (`app/services/webhook_handlers/`)

#### PR Lifecycle

| Handler | Trigger | Action |
|---------|---------|--------|
| `PrOpened` | PR opened | Create PR record, initialize empty PrMetrics, correlate with existing sessions |
| `PrSynchronized` | Commits pushed | Recalculate `post_open_commits` |
| `PrMerged` | PR merged | Fetch file/commit data from GitHub API, compute line_revisit_rate/ci_success_rate, finalize all metrics (immutable) |
| `PrClosed` | PR closed (not merged) | Fetch file/commit data from GitHub API, compute line_revisit_rate/ci_success_rate, finalize as abandoned |
| `ReviewSubmitted` | Review posted | Capture review cycle time on first human review |
| `CiCompleted` | Check suite finished | Update `ci_success_rate` |

#### Installation Lifecycle

| Handler | Trigger | Action |
|---------|---------|--------|
| `InstallationCreated` | App installed | Upsert `GithubInstallation` (idempotent with setup callback) |
| `InstallationDeleted` | App uninstalled | Mark status `deleted`, detach repos |
| `InstallationSuspend` | App suspended | Mark status `suspended` |
| `InstallationUnsuspend` | App unsuspended | Mark status `active` |
| `InstallationRepositories` | Repos added/removed | Upsert repos on add + enqueue `BackfillRepoJob`, detach `github_installation_id` on remove |

The setup-URL callback (Phase 3) and `InstallationCreated` webhook can arrive in either order. Both are idempotent — the callback sets the org association, the webhook fills in installation details. `GithubInstallation.organization_id` is nullable to support the webhook-first case.

All handlers inherit from `Base`, which provides:
- `find_repo` — Installation-scoped repo lookup: prefers repos belonging to the installation's org, falls back to unscoped owner/name match for CLI-pushed repos
- `find_pr` / `find_or_create_pr` — PR record lookup/upsert
- `ensure_pr_metrics` — Create PrMetrics if missing
- `pr_finalized?` — Guard against updating finalized records

All PR/review/CI handlers accept an optional `installation:` keyword argument, set by the job dispatcher.

### Installation Scoping

`ProcessGitHubWebhookJob` extracts `installation.id` from every webhook payload and resolves it to a `GithubInstallation` record before dispatching to PR/review/CI handlers:
- **Active installation** → passed to the handler for org-scoped repo lookup
- **Unknown installation** → event dropped with a warning log
- **Suspended/deleted installation** → event dropped with a warning log
- **No installation field** (legacy or non-app webhooks) → `nil` passed, handler uses unscoped lookup (backward compatible with CLI-pushed repos)

Installation lifecycle events (`installation.*`, `installation_repositories`) bypass this check — they manage the installation state itself.

## Background Jobs

**ProcessGitHubWebhookJob** (queue: `:webhooks`)
- Resolves `installation.id` from payload and validates installation is active before dispatching PR/review/CI events
- Dispatches to the appropriate handler based on event type and action
- Development: Sidekiq adapter
- Production: SolidQueue (in-database job queue)

**GithubApp::BackfillInstallationJob** (queue: `:default`)
- Triggered after a GitHub App installation is saved (from both the setup callback and the `installation.created` webhook, whichever links the org first)
- Lists all repositories accessible to the installation via the GitHub API
- Upserts `Repo` records and enqueues `BackfillRepoJob` for each
- Updates `GithubInstallation#last_synced_at` on completion

**BackfillRepoJob** (queue: `:default`)
- Single-repo backfill. Triggered by: BackfillInstallationJob, PushService (post-push), InstallationRepositories webhook, ReconcileReposJob
- Fetches PRs from the GitHub API for the last N days (default 90, configurable via `GITHUB_APP_BACKFILL_DAYS`)
- Reuses existing webhook handlers (`PrOpened`, `PrMerged`, `PrClosed`, `ReviewSubmitted`) via `Backfillable` concern
- Backfills PR reviews from GitHub API before finalization so review cycle time is captured
- Per-PR errors are caught and logged without aborting the backfill
- Runs `SessionPrCorrelationService` after backfill to link existing sessions to newly created PRs
- Retries on `Octokit::TooManyRequests` (8 attempts, polynomial backoff) and `Octokit::ServerError` (3 attempts)
- Idempotent — safe to run repeatedly; skips already-settled PRs for GitHub metrics

**ReconcileReposJob** (queue: `:default`)
- Scheduled daily at 3am (via `config/recurring.yml`)
- Self-healing: enqueues `BackfillRepoJob` for every repo with an active GitHub App
- Catches missed webhooks, state drift, and ensures the system converges to GitHub's truth

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.rb` | All endpoint definitions |
| `app/services/push_service.rb` | Push ingestion logic |
| `app/services/auth_service.rb` | OAuth + onboarding |
| `app/services/webhook_handlers/*.rb` | Event processing (11 handlers + base: 6 PR lifecycle + 5 installation lifecycle) |
| `app/controllers/api/v1/base_controller.rb` | Auth helpers (API key + session) |
| `app/controllers/api/v1/push_controller.rb` | Push endpoint |
| `app/controllers/api/v1/teams_controller.rb` | Team CRUD + team-scoped PRs/metrics |
| `app/controllers/api/v1/team_memberships_controller.rb` | Team member management |
| `app/controllers/concerns/pr_serialization.rb` | Shared PR JSON serialization |
| `app/controllers/api/v1/repos_controller.rb` | Data read endpoints |
| `app/controllers/api/v1/github_installations_controller.rb` | Install URL + installation state API |
| `app/controllers/github_app/installations_controller.rb` | GitHub App setup callback handler |
| `app/services/github_app/state_token.rb` | Signed state token for install flow |
| `app/services/github_app/jwt_generator.rb` | GitHub App JWT signing |
| `app/services/github_app/installation_token.rb` | Installation access token minting + caching |
| `app/services/github_app/client.rb` | Octokit wrapper for installation-scoped API calls |
| `app/models/team.rb` | Team model (hierarchy, descendant queries, member usernames) |
| `app/models/team_membership.rb` | Team-to-org-membership join with org validation |
| `app/models/pr_metrics.rb` | Scoped write protection (GitHub fields locked, session fields open) |
| `app/services/session_pr_correlation_service.rb` | Branch-match session-to-PR correlation |
| `app/jobs/process_git_hub_webhook_job.rb` | Webhook dispatcher |
| `app/jobs/github_app/backfill_installation_job.rb` | Post-install coordinator (enqueues per-repo backfill) |
| `app/jobs/backfill_repo_job.rb` | Single-repo backfill from GitHub API + session correlation |
| `app/jobs/reconcile_repos_job.rb` | Daily reconciliation (self-healing) |
| `app/jobs/concerns/backfillable.rb` | Shared PR backfill logic (used by BackfillRepoJob) |
| `config/initializers/plans.rb` | Plan capability definitions (PLANS constant) |
| `app/services/plan_service.rb` | Capability enforcement layer |
| `app/services/stripe_service.rb` | Stripe API wrapper |
| `app/services/stripe_handlers/*.rb` | Stripe webhook event handlers |
| `app/controllers/api/v1/billing_controller.rb` | Billing API endpoints |
| `app/jobs/process_stripe_webhook_job.rb` | Stripe webhook dispatcher |
| `lib/tasks/plans.rake` | Manual plan management (ax:set_plan, ax:override) |
| `db/schema.rb` | Generated schema |
