# Rails Server

The Rails API powers the managed service at `app.ax.dev`. It stores data from multiple developer CLIs, processes GitHub webhooks in real time, and serves data to the dashboard via org-scoped endpoints.

Location: `server/`

## Models

### Identity & Organization

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `users` | GitHub OAuth identity (github_id, username, email, avatar) |
| `Organization` | `organizations` | Team container (slug, name, is_personal) |
| `OrgMembership` | `org_memberships` | User-org join with role (owner, admin, member) |
| `GitHubInstallation` | `github_installations` | GitHub App installation per org |

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
| `PR` | `prs` | Pull request (number, state, branch, timestamps, diff stats) |
| `Commit` | `commits` | Git commit (sha as PK, claude-authored flag, post-open flag) |
| `CodingSession` | `sessions` | Claude Code session (tokens, cost, model, message counts) |
| `SessionPr` | `session_prs` | Session-to-PR correlation with confidence |
| `PrMetrics` | `pr_metrics` | All 16 metrics per PR (with finalization lock) |
| `RepoMetrics` | `repo_metrics` | Repo-level aggregates (unmerged spend, totals) |
| `WatchedRepo` | `watched_repos` | Polling metadata |
| `PlanAnalysis` | `plan_analyses` | Plan-to-implementation comparison |

### Key Model Behaviors

**PrMetrics** has a `before_update` callback (`prevent_finalized_update`) that blocks changes once `metrics_finalized = true`. This ensures metric immutability after PR closure.

**User** automatically processes pending invites on creation — if someone was invited by GitHub username before they signed up, the invite is accepted on first login.

**Repo** is auto-assigned to the pushing user's personal org on first push. Once assigned, org ownership is validated on subsequent pushes.

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
| `GET` | `/api/v1/orgs/:slug/repos/:id/prs` | Finalized PRs with all metrics |
| `GET` | `/api/v1/orgs/:slug/repos/:id/metrics` | Aggregated metrics (averages, sums) |
| `GET` | `/api/v1/orgs/:slug/repos/:id/timeline` | PR timeline for trend charts |
| `GET` | `/api/v1/orgs/:slug/repos/:id/repo-metrics` | Repo-level metrics (unmerged spend) |

### Org Management (Session Token, Admin Required)

| Method | Path | Purpose |
|--------|------|---------|
| `GET/PUT/DELETE` | `/api/v1/orgs/:slug/members[/:id]` | List, update role, remove members |
| `GET/POST/DELETE` | `/api/v1/orgs/:slug/invites[/:id]` | List, create, revoke invites |
| `POST` | `/api/v1/invites/:token/accept` | Accept an invite |

### Auth

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/users/auth/github` | Initiate GitHub OAuth |
| `GET` | `/users/auth/github/callback` | OAuth callback → create user, generate session |
| `GET` | `/auth/me` | Current user info + orgs |
| `POST` | `/auth/logout` | Destroy session |
| `GET/POST` | `/api/v1/api_key[/rotate]` | View or rotate CLI API key |

### Other

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/webhooks/github` | GitHub webhook receiver (HMAC validated) |
| `POST` | `/waitlist` | Add email to waitlist |
| `GET` | `/up` | Health check |

## Services

### PushService (`app/services/push_service.rb`)
Main ingestion orchestrator. Called by the push controller.

1. Upserts repo (auto-assigns to user's personal org if new)
2. Validates user is member of repo's org
3. Upserts PRs, sessions, commits, correlations, metrics — all in a transaction
4. Skips updates to already-finalized PR metrics
5. Returns entity count hash

### AuthService (`app/services/auth_service.rb`)
Handles OAuth and onboarding:
- `find_or_create_from_github(auth_hash)` — Creates/updates user, personal org, API key
- `process_pending_invites(user)` — Auto-accepts invites matching the user's GitHub username
- `ensure_can_create_org!(user)` — Checks waitlist approval

### OrgService (`app/services/org_service.rb`)
Creates orgs, assigns owner membership, marks waitlist entry as "joined".

## Webhook Handling

GitHub webhooks arrive at `POST /webhooks/github`. The controller validates the `X-Hub-Signature-256` header against `AX_WEBHOOK_GITHUB_SECRET`, then enqueues `ProcessGitHubWebhookJob` for async processing.

### Handlers (`app/services/webhook_handlers/`)

| Handler | Trigger | Action |
|---------|---------|--------|
| `PrOpened` | PR opened | Create PR record, initialize empty PrMetrics |
| `PrSynchronized` | Commits pushed | Recalculate `post_open_commits` |
| `PrMerged` | PR merged | Finalize all metrics (immutable) |
| `PrClosed` | PR closed (not merged) | Finalize as abandoned |
| `ReviewSubmitted` | Review posted | Update `first_pass_accepted` |
| `CiCompleted` | Check suite finished | Update `ci_success_rate` |

All handlers inherit from `Base`, which provides:
- `find_repo` / `find_pr` / `find_or_create_pr` — Record lookup
- `ensure_pr_metrics` — Create PrMetrics if missing
- `pr_finalized?` — Guard against updating finalized records

Handlers silently skip unknown repos (repos not yet pushed to the server).

## Background Jobs

**ProcessGitHubWebhookJob** (queue: `:webhooks`)
- Dispatches to the appropriate handler based on event type and action
- Development: Sidekiq adapter
- Production: SolidQueue (in-database job queue)

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.rb` | All endpoint definitions |
| `app/services/push_service.rb` | Push ingestion logic |
| `app/services/auth_service.rb` | OAuth + onboarding |
| `app/services/webhook_handlers/*.rb` | Event processing (6 handlers + base) |
| `app/controllers/api/v1/base_controller.rb` | Auth helpers (API key + session) |
| `app/controllers/api/v1/push_controller.rb` | Push endpoint |
| `app/controllers/api/v1/repos_controller.rb` | Data read endpoints |
| `app/models/pr_metrics.rb` | Finalization lock callback |
| `app/jobs/process_git_hub_webhook_job.rb` | Webhook dispatcher |
| `db/schema.rb` | Generated schema (20 tables) |
