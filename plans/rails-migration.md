# Plan: Migrate Server to Ruby on Rails

## Context

AX currently has a Go server (`internal/server/`) that handles the team/managed service functionality: push API, read endpoints, webhook processing, and API key management. The CLI (`cmd/ax/`) handles local analysis (git parsing, session parsing, metric computation) and pushes results to the server.

We're dropping the self-hosted deployment model entirely. AX will have two modes:

- **Local mode**: Go CLI + SQLite. Unchanged.
- **Managed mode**: Rails API at `app.ax.dev` + Next.js dashboard. CLI pushes data here.

The Go CLI stays. The Go server, Docker Compose self-hosted setup, and Helm chart are replaced by a Rails application purpose-built for the managed service.

**Important:** The Rails app has zero dependencies on Go code or the `ax` binary. It is a fully independent application. Data enters via HTTP (push payloads from the CLI, webhooks from GitHub) and is served as JSON to the dashboard. No polling — the two inbound data paths (CLI push + GitHub webhooks) cover all data ingestion.

### Why Rails

- Primary developer has no Go experience — maintainability matters most for the actively developed managed service
- Rails conventions (Devise, ActiveRecord, Sidekiq, migrations) cover 80% of the managed service plan out of the box
- The server is fundamentally a web API with auth, background jobs, and CRUD — Rails' sweet spot
- No need for portable binaries or Go's performance characteristics on the server side

### What stays in Go

- `cmd/ax/` — CLI entry point (sync, report, status, export, init, push, dashboard, watch)
- `internal/metrics/` — All 16 metric calculators
- `internal/parsers/` — Git, GitHub, Claude session parsers
- `internal/correlator/` — Session-to-PR correlation
- `internal/sync/` — Local sync orchestration
- `internal/push/` — Push client (HTTP, talks to Rails server)
- `internal/config/` — Local config (~/.ax/config.json)
- `internal/hooks/` — Claude Code hook installation
- `internal/pricing/` — Token cost computation
- `internal/export/` — Local export (JSON, CSV, JSONL)
- `internal/db/db.go` — SQLite schema/migrations for local mode only

### What gets removed from Go

- `internal/server/` — Entire server package (replaced by Rails)
- `internal/events/` — Webhook/event handling (reimplemented in Rails)
- `internal/sync/watch.go` — GitHub polling (no longer needed; webhooks replace it)
- `internal/sync/finalize.go` — Metric finalization (reimplemented in Rails webhook handlers)
- `internal/db/postgres_migrations.go` — Postgres schema (Rails migrations)
- `internal/db/queries.go` — Server-side queries (ActiveRecord)
- `internal/db/models.go` — Server-side models (ActiveRecord)
- `internal/watch/` — System-level scheduling (launchd/cron — local watch only, keep if needed)
- `cmd/ax/main.go` — `ax server` command and subcommands
- `docker-compose.yml` — Self-hosted deployment
- `deploy/helm/` — Kubernetes deployment (rebuild later for managed infra)

Note: `internal/db/` still has SQLite-specific code for local mode. The Postgres models/queries/migrations move to Rails. Some Go model structs and query functions are shared between local SQLite and Postgres — these need to be audited. Keep what local mode needs, remove what was Postgres-only.

## Architecture

```
Local Mode (unchanged):
  Go CLI → git/gh/sessions → metrics → SQLite (~/.ax/ax.db)
  Go CLI → ax dashboard → Next.js dev server → reads SQLite directly

Managed Mode:
  Go CLI → ax push → POST /api/v1/push → Rails API (app.ax.dev)
  GitHub → POST /webhooks/github → Rails API → Sidekiq jobs
  Browser → Next.js dashboard → Rails API (all data via /api/v1/*)

  No polling. Two inbound paths cover all data:
    1. CLI push (commits, sessions, metrics, PR data)
    2. GitHub webhooks (PR state changes, reviews, CI results)
```

```
Repository Structure:
  cmd/ax/           Go CLI (stays)
  internal/         Go packages (stays, minus server/events/postgres)
  server/           Rails API application (new)
    app/
      models/       ActiveRecord models
      controllers/  API controllers
      jobs/         Sidekiq background jobs (webhook processing, session cleanup)
      services/     Business logic (push processing, finalization)
    config/
    db/
      migrate/      Rails migrations
  dashboard/        Next.js (stays, minor API URL changes)
```

## Data Model (Rails)

### Models

These mirror the existing Postgres schema, with Rails conventions applied:

```ruby
# Core data models (from existing schema)
class Repo < ApplicationRecord
  has_many :prs, dependent: :destroy
  has_many :commits, dependent: :destroy
  has_many :sessions, class_name: "CodingSession", dependent: :destroy
  has_many :repo_metrics, dependent: :destroy
  # Managed service additions
  belongs_to :organization
end

class Pr < ApplicationRecord
  belongs_to :repo
  has_many :commits, dependent: :destroy
  has_one  :pr_metrics, dependent: :destroy
  has_many :session_prs, dependent: :destroy
  has_many :sessions, through: :session_prs, source: :coding_session
  has_many :plan_analyses, dependent: :destroy
end

class Commit < ApplicationRecord
  belongs_to :repo
  belongs_to :pr, optional: true
  belongs_to :session, class_name: "CodingSession", optional: true
end

class CodingSession < ApplicationRecord
  self.table_name = "sessions"
  belongs_to :repo
  has_many :session_prs, dependent: :destroy
  has_many :prs, through: :session_prs
end

class SessionPr < ApplicationRecord
  belongs_to :coding_session, foreign_key: "session_id"
  belongs_to :pr
end

class PrMetrics < ApplicationRecord
  belongs_to :pr

  # Immutability: once finalized, no updates
  before_update :prevent_finalized_update

  private

  def prevent_finalized_update
    if metrics_finalized_was == 1 && metrics_finalized == 1
      errors.add(:base, "Finalized metrics cannot be updated")
      throw(:abort)
    end
  end
end

class RepoMetrics < ApplicationRecord
  belongs_to :repo
end

class WatchedRepo < ApplicationRecord
  belongs_to :repo
end

# Identity models (from managed-service-identity plan)
class User < ApplicationRecord
  has_many :org_memberships, dependent: :destroy
  has_many :organizations, through: :org_memberships
  has_one  :api_key, dependent: :destroy
  has_many :sessions_auth, class_name: "UserSession", dependent: :destroy
end

class Organization < ApplicationRecord
  has_many :org_memberships, dependent: :destroy
  has_many :users, through: :org_memberships
  has_many :repos, dependent: :destroy
  has_many :invites, dependent: :destroy
  belongs_to :created_by, class_name: "User"
end

class OrgMembership < ApplicationRecord
  belongs_to :organization
  belongs_to :user
  belongs_to :invited_by, class_name: "User", optional: true
end

class Invite < ApplicationRecord
  belongs_to :organization
  belongs_to :invited_by, class_name: "User"
end

class ApiKey < ApplicationRecord
  belongs_to :user
  has_secure_password :key, validations: false  # bcrypt
end

class UserSession < ApplicationRecord
  belongs_to :user
end

class WaitlistEntry < ApplicationRecord
  self.table_name = "waitlist"
end
```

### Key Schema Differences from Go

- Primary keys: Rails uses `bigint` auto-increment by default (Go used `SERIAL`)
- Timestamps: Rails adds `created_at`/`updated_at` automatically
- Sessions table: Named `sessions` in DB but `CodingSession` in Rails to avoid conflict with auth sessions (`UserSession` / `user_sessions`)
- Commits primary key: Go used `sha TEXT PRIMARY KEY`. Rails should keep this as a string PK rather than adding a numeric id
- Booleans: Go used `INTEGER` 0/1 for flags. Rails uses native `boolean`

## Implementation Phases

### Phase 1: Rails App Scaffold

1. `rails new server --api --database=postgresql --skip-javascript --skip-asset-pipeline`
2. Add gems: `sidekiq`, `redis`, `devise`, `omniauth-github`, `rack-cors`, `bcrypt`, `jbuilder`
3. Configure database.yml, sidekiq.yml, cors initializer
4. Set up RSpec or Minitest
5. Create base controller with API error handling

### Phase 2: Core Data Models + Migrations

Recreate the existing Postgres schema as Rails migrations:

1. `repos` table (+ `organization_id` foreign key from the start)
2. `prs` table
3. `commits` table (string primary key on `sha`)
4. `sessions` table (string primary key on `id`)
5. `session_prs` table (composite key)
6. `pr_metrics` table (16 nullable metric columns)
7. `plan_analyses` table
8. `repo_metrics` table
9. Identity tables: `users`, `organizations`, `org_memberships`, `invites`, `user_sessions`, `waitlist`, `api_keys`

Write model validations, associations, and scopes.

### Phase 3: Push API

Reimplement `POST /api/v1/push` — this is the most critical endpoint since it's how CLI data enters the system.

```ruby
class Api::V1::PushController < ApplicationController
  before_action :authenticate_api_key!

  def create
    result = PushService.new(current_user, push_params).execute
    render json: { ok: true, entities: result.counts }
  rescue PushService::Error => e
    render json: { ok: false, error: e.message }, status: :unprocessable_entity
  end
end

class PushService
  # Wraps everything in a transaction
  # Upserts: repo, PRs, commits, sessions, session_prs, pr_metrics, repo_metrics
  # Resolves org from repo's remote_url → registered repos
  # Returns entity counts
end
```

Key behaviors to preserve:
- All upserts in a single transaction
- Finalized metrics are immutable (skip update if already finalized)
- Return entity counts in response
- 10MB payload size limit

### Phase 4: Read API Endpoints

Reimplement the read endpoints the dashboard depends on:

```
GET  /api/v1/orgs/:slug/repos                → list repos for org
GET  /api/v1/orgs/:slug/repos/:id/prs        → finalized PRs with metrics
GET  /api/v1/orgs/:slug/repos/:id/metrics     → aggregate metrics
GET  /api/v1/orgs/:slug/repos/:id/timeline    → time-series data
GET  /api/v1/orgs/:slug/repos/:id/repo-metrics → unmerged token spend
GET  /api/v1/health                            → health check
```

These are straightforward ActiveRecord queries. Use `includes` / `eager_load` to prevent N+1s.

### Phase 5: Webhook Event Processing

Reimplement the event service as Rails controllers + Sidekiq jobs:

```ruby
class WebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token

  def github
    unless valid_github_signature?(request)
      return head :unauthorized
    end

    ProcessGitHubWebhookJob.perform_async(
      request.headers["X-GitHub-Event"],
      request.raw_post
    )

    head :ok
  end
end

class ProcessGitHubWebhookJob
  include Sidekiq::Job

  def perform(event_type, payload_json)
    payload = JSON.parse(payload_json)

    case event_type
    when "pull_request"
      handle_pull_request(payload)
    when "pull_request_review"
      handle_review(payload)
    when "check_suite"
      handle_check_suite(payload)
    end
  end
end
```

Event handlers to reimplement:
- **pr_opened** — Create/update PR, set post_open_commits = 0
- **pr_synchronized** — Update post_open_commits (current - open count)
- **review_submitted** — Set first_pass_accepted (latching: CHANGES_REQUESTED = false, APPROVED = true)
- **ci_completed** — Set ci_success_rate (1.0 or 0.0)
- **pr_merged / pr_closed** — Finalize all metrics

### Phase 6: Identity + Auth (from managed-service-identity plan)

This is Phase B-E from the managed service plan, now implemented in Rails:

1. **Devise + OmniAuth GitHub** for user auth
2. **Session management** via Devise's built-in session handling
3. **Org CRUD** endpoints
4. **Invite flow** with token-based links
5. **Waitlist** gating for org creation
6. **API key management** with bcrypt hashing

Rails makes this dramatically simpler than hand-rolling in Go. Devise handles OAuth, sessions, and password-less auth. OmniAuth handles the GitHub callback flow.

### Phase 7: Dashboard Updates

1. Remove dual-mode (`isAPIMode()`) logic from `db.ts` — managed mode always uses API
2. Update API base URL to point to Rails server
3. Add org namespace to all API calls (`/api/v1/orgs/:slug/...`)
4. Add auth pages (login, onboarding, settings) — per managed service plan
5. Add org switcher component
6. Local mode continues to read SQLite directly (unchanged)

### Phase 8: Go Cleanup

1. Remove `internal/server/` package
2. Remove `internal/events/` package
3. Remove `internal/sync/watch.go` and `internal/sync/finalize.go`
4. Remove `internal/db/postgres_migrations.go`
5. Remove server-only models and queries from `internal/db/`
6. Remove `ax server` command and subcommands from `cmd/ax/main.go`
7. Remove `docker-compose.yml` and `deploy/helm/`
8. Keep `ax watch` CLI command for local-mode polling (uses SQLite, runs locally)
9. Keep `ax push` — it already speaks HTTP, no changes needed
10. Update `ax init --team` to point at `app.ax.dev` (or custom URL for staging)

## Deployment (Managed Service)

The Rails app deploys as a standard web service. Suggested stack:

```
Rails API (Puma) ─── Postgres
  │
  └── Sidekiq ─── Redis
        ├── ProcessGitHubWebhookJob (on-demand, from webhook events)
        └── CleanExpiredSessionsJob (daily)
```

Deployment options: Heroku, Render, Fly.io, AWS ECS, or Kubernetes. No Helm chart needed for MVP — use the platform's native deployment.

## Migration Checklist

- [ ] Phase 1: Rails scaffold with gems and config
- [ ] Phase 2: Migrations + models for all tables
- [ ] Phase 3: Push API (most critical — blocks CLI integration testing)
- [ ] Phase 4: Read API endpoints (blocks dashboard)
- [ ] Phase 5: Webhook processing (GitHub events → metric updates + finalization)
- [ ] Phase 6: Identity + auth (Devise + OmniAuth)
- [ ] Phase 7: Dashboard updates
- [ ] Phase 8: Go cleanup

## Risks

1. **Data format mismatches**: The Go CLI serializes push payloads as JSON. Rails must accept the exact same format. Write integration tests that send real push payloads from the Go CLI to the Rails API.

2. **Session timestamp handling**: Claude Code sessions use Unix milliseconds. Rails typically works with Time objects. Be explicit about serialization at the API boundary.

3. **Metric finalization correctness**: The finalization logic (when to compute, immutability after finalized) is critical. Port the Go logic carefully and test against known-good outputs.

4. **Push payload size**: Some repos with many PRs/sessions can produce large payloads. Keep the 10MB limit and consider streaming or chunked pushes for very large repos.
