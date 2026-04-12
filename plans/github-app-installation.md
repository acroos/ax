# Plan: GitHub App Installation Flow

## Context

[ADR-013](../docs/decisions/013-github-integration-model.md) decided that AX's managed service uses a **dual-app** GitHub integration: an OAuth App for login (implemented, working at `https://ax.up.railway.app`) and a **GitHub App** for repository access and webhook delivery. The login half is done; the GitHub App half is entirely unbuilt.

What exists today:

- The OAuth App authenticates users via `omniauth-github`, creating `User` and `Organization` records.
- `POST /webhooks/github` exists on the Rails server with HMAC signature validation and dispatches events (`pull_request`, `pull_request_review`, `check_suite`) to a small set of handlers in `server/app/services/webhook_handlers/`.
- The ingestion path is CLI-push-dominant: `ax sync` reads local git history and `gh` CLI PR data, then `ax push` uploads it to `/api/v1/push`.
- Repos on the Rails side (`repos` table) have an optional `organization_id` but no concept of a GitHub App installation. When a webhook arrives, handlers resolve the repo by `owner/name` with no cross-check that the event came from an authorized installation for the org.

What's missing:

- No model or table for GitHub App installations.
- No install flow — admins have no way to tell AX "connect my org to this GitHub App installation."
- No handler for the `installation` / `installation_repositories` webhook events (they are silently dropped).
- No JWT-based app authentication or installation-token minting. Rails has no credentials to make authenticated GitHub API calls at all.
- No code path that uses installation tokens to fetch repo data directly from GitHub. Backfill on install is not possible; all data still depends on CLI push.
- The dashboard has no "Install GitHub App" button in `/{slug}/settings` (the whole settings page is a placeholder).
- Webhooks are validated only by a single static shared secret (`AX_WEBHOOK_GITHUB_SECRET`). GitHub Apps generate a per-app webhook secret at install time, and it should be used instead.

The goal of this plan is to close all of that.

## Goals

1. **One-click org opt-in.** An authenticated org admin clicks a button in dashboard settings, is redirected to GitHub's "Install App" flow, picks repos (or "all repos"), and returns to a dashboard page confirming the installation is active.
2. **Authenticated webhook delivery.** Events flowing into `POST /webhooks/github` carry an `installation.id` that resolves to a known `GithubInstallation`, which in turn resolves to an `Organization`. Events from installations we don't know are rejected.
3. **Installation-token API access.** Rails can mint short-lived installation access tokens from the GitHub App's private key + installation ID and use them to make authenticated GitHub API calls (PR lists, commit history, reviews, check runs) scoped to the installation.
4. **Initial backfill on install.** When an installation lands, AX proactively fetches the last N days (configurable; default 90) of PRs, reviews, and check suites for every repo in the installation so the dashboard is not empty until someone runs `ax push`.
5. **Installation lifecycle.** Handle `installation.created`, `installation.deleted`, `installation.suspend`, `installation.unsuspend`, `installation_repositories.added`, and `installation_repositories.removed`. An org that uninstalls the app stops receiving webhooks and its `GithubInstallation` is marked inactive; reinstalling flips it back on.
6. **Per-installation webhook secret.** Each `GithubInstallation` optionally stores its own webhook secret for signature validation, falling back to `AX_WEBHOOK_GITHUB_SECRET` for the GitHub-App-level webhook.

## Non-Goals

- **User-to-server tokens from the GitHub App.** We already decided in ADR-013 that login goes through the separate OAuth App. The GitHub App's user-authorization flow is not used.
- **Replacing CLI push.** CLI push remains a valid ingestion path. Installation-token fetching augments it; it does not replace it. A developer without an installation can still run `ax push`.
- **Cross-org GitHub Apps.** One GitHub App powers the whole managed service. We do not issue per-org GitHub Apps.
- **Automatic repo creation outside of an installation.** Repos added to the DB through CLI push without an installation stay as they are — we do not retroactively require an installation for pre-existing repos.
- **Fine-grained permission management.** The GitHub App requests a fixed set of permissions at creation time. We do not expose UI to add or remove permissions.
- **Check runs, status updates, or writing back to GitHub.** Read-only in the first pass. If we later want to write commit statuses (e.g., "AX: PR quality score: A"), add that after this plan lands.

## Architecture Overview

### Install flow

```
Browser                Rails (api)              GitHub
  │                       │                       │
  │  Click "Install App"  │                       │
  │  in /{slug}/settings  │                       │
  │──────────────────────▶│                       │
  │                       │                       │
  │                       │ Build install URL     │
  │                       │ with ?state=<org>     │
  │◀──────────────────────│ (redirect)            │
  │                       │                       │
  │  302 to github.com/   │                       │
  │  apps/ax-metrics/     │                       │
  │  installations/new    │                       │
  │──────────────────────────────────────────────▶│
  │                       │                       │
  │           (user picks repos, clicks install)  │
  │                       │                       │
  │◀──────────────────────────────────────────────│
  │  302 to setup_url     │                       │
  │  with ?installation_  │                       │
  │  id=N&state=<org>     │                       │
  │                       │                       │
  │──────────────────────▶│                       │
  │  GET /github/         │                       │
  │  installations/       │                       │
  │  callback             │                       │
  │                       │                       │
  │                       │ Look up org by state, │
  │                       │ verify admin,         │
  │                       │ persist installation, │
  │                       │ mint token, kick off  │
  │                       │ backfill job          │
  │                       │                       │
  │◀──────────────────────│                       │
  │  302 to dashboard:    │                       │
  │  /{slug}/settings?    │                       │
  │  installed=true       │                       │
```

In parallel, GitHub also delivers an `installation.created` webhook to `POST /webhooks/github`. The setup-URL callback and the webhook may arrive in either order, so both paths must be idempotent.

### Webhook authorization flow

```
GitHub event ─▶ POST /webhooks/github
                 │
                 ▼
         validate X-Hub-Signature-256 using
         per-installation secret (fallback: global)
                 │
                 ▼
         extract installation.id from payload
                 │
                 ▼
         find GithubInstallation by github_installation_id
                 │
                 ▼
           ┌─── not found ───▶ 404 (reject)
           │
           ▼
        installation exists and active?
           │
           ├─── no ──▶ 200 (swallow, do not process)
           │
           ▼
        dispatch to existing handler chain
        (PrOpened, PrMerged, CiCompleted, …)
        with the installation attached for
        downstream API calls it may need to make
```

### API access flow

```
caller needs to hit github.com ── installation_id
  │
  ▼
AppAuthToken.generate              (JWT signed with GITHUB_APP_PRIVATE_KEY,
                                    10-minute expiry, iss=APP_ID, cached until
                                    ~8 minutes elapsed)
  │
  ▼
POST https://api.github.com/app/installations/<installation_id>/access_tokens
Authorization: Bearer <app JWT>
  │
  ▼
receive { token, expires_at }
  │
  ▼
cache in Rails.cache under github_installation_token:<installation_id>
with expires_at - 30s TTL, reuse across requests
  │
  ▼
use <token> as Authorization: token <token> on subsequent
GitHub API calls for that installation
```

## Data Model

### New table: `github_installations`

```ruby
create_table :github_installations do |t|
  t.references :organization, null: false, foreign_key: true
  t.bigint  :github_installation_id, null: false, index: { unique: true }
  t.string  :account_login,    null: false           # e.g. "acroos"
  t.string  :account_type,     null: false           # "User" | "Organization"
  t.string  :target_type,      null: false           # same values — GitHub distinguishes
  t.string  :repository_selection, null: false       # "all" | "selected"
  t.string  :webhook_secret                          # optional per-installation HMAC secret
  t.string  :status, null: false, default: "active"  # "active" | "suspended" | "deleted"
  t.datetime :installed_at
  t.datetime :last_synced_at
  t.references :installed_by, foreign_key: { to_table: :users }
  t.jsonb   :permissions, null: false, default: {}   # snapshot of granted permissions
  t.jsonb   :events,      null: false, default: []   # subscribed event types
  t.timestamps
end

add_index :github_installations, :organization_id
add_index :github_installations, :status
```

Model:

```ruby
class GithubInstallation < ApplicationRecord
  belongs_to :organization
  belongs_to :installed_by, class_name: "User", optional: true
  has_many :repos, -> { where.not(github_owner: nil) }, primary_key: :account_login, foreign_key: :github_owner

  validates :github_installation_id, presence: true, uniqueness: true
  validates :status, inclusion: { in: %w[active suspended deleted] }

  scope :active, -> { where(status: "active") }

  def active?
    status == "active"
  end
end
```

### Changes to `repos`

Add a reference so we know which installation discovered each repo.

```ruby
add_reference :repos, :github_installation, foreign_key: true, null: true
```

Nullable because repos added via CLI push without an installation still work. We set this column when a repo is seen through an `installation_repositories.added` event or during install backfill.

### Indexing webhook lookups

Add an index on `repos(github_owner, github_repo)` if it does not already exist, since the webhook handler chain uses this as the lookup key. (Verify before adding — it may already exist implicitly.)

## GitHub App Setup (external)

Create a single GitHub App with the settings below. These values are manual and captured here so the setup is reproducible across environments.

| Field | Value |
|---|---|
| Name | `AX Metrics` (or similar) |
| Homepage URL | `https://ax-metrics.vercel.app` |
| Setup URL | `https://ax.up.railway.app/github/installations/callback` |
| Redirect after install | checked; use the Setup URL |
| Webhook URL | `https://ax.up.railway.app/webhooks/github` |
| Webhook secret | generated, stored as `GITHUB_APP_WEBHOOK_SECRET` env var |
| Repository permissions | `Contents: Read`, `Metadata: Read`, `Pull requests: Read`, `Checks: Read` |
| Organization permissions | `Members: Read` (optional — lets us auto-populate team membership later) |
| Account permissions | none |
| Subscribed events | `pull_request`, `pull_request_review`, `check_suite`, `installation`, `installation_repositories`, `push` |
| Where can this app be installed? | `Any account` |

Credentials to add to Railway:

| Env var | Value |
|---|---|
| `GITHUB_APP_ID` | numeric app ID from the GitHub App settings page |
| `GITHUB_APP_PRIVATE_KEY` | PEM string (literal newlines OK) from the "Generate a private key" button |
| `GITHUB_APP_WEBHOOK_SECRET` | same string configured on the GitHub App webhook settings |
| `GITHUB_APP_SLUG` | the public slug of the app, used to build install URLs |
| `GITHUB_APP_BACKFILL_DAYS` | (optional, default 90) days of history to backfill on install |

The existing `AX_WEBHOOK_GITHUB_SECRET` env var stays as a fallback for any non-App webhook (there won't be any in the managed service, but keep the code path for dev/local testing).

## Rails Implementation

### Gemfile additions

```ruby
gem "jwt"               # JWT signing for GitHub App tokens
gem "octokit", "~> 9.0" # GitHub API client (we are fine with the dep — Rails already pulls many more)
```

Octokit gives us authenticated clients with installation-token support and rate-limit helpers. If we want to avoid the dep, the whole API surface we need is small enough to hand-roll with Net::HTTP, but octokit buys us less custom code and stronger retry/rate-limit behavior.

### New service: `GithubApp::JwtGenerator`

```ruby
module GithubApp
  class JwtGenerator
    EXPIRY = 9.minutes  # GitHub allows up to 10; use 9 for safety margin

    def self.generate
      payload = {
        iat: Time.now.to_i - 30,
        exp: Time.now.to_i + EXPIRY.to_i,
        iss: ENV.fetch("GITHUB_APP_ID").to_i
      }
      JWT.encode(payload, private_key, "RS256")
    end

    def self.private_key
      OpenSSL::PKey::RSA.new(ENV.fetch("GITHUB_APP_PRIVATE_KEY"))
    end
  end
end
```

### New service: `GithubApp::InstallationToken`

```ruby
module GithubApp
  class InstallationToken
    CACHE_KEY = "github_installation_token:%{id}"

    def self.fetch(installation_id)
      Rails.cache.fetch(CACHE_KEY % { id: installation_id }, expires_in: 50.minutes) do
        mint(installation_id)
      end
    end

    def self.mint(installation_id)
      app_jwt = GithubApp::JwtGenerator.generate
      client  = Octokit::Client.new(bearer_token: app_jwt)
      result  = client.create_app_installation_access_token(installation_id)
      result[:token]
    end
  end
end
```

Cache TTL (50 min) is deliberately shorter than the token's 1-hour lifetime so a token is never served within 10 minutes of expiry.

### New service: `GithubApp::Client`

Thin wrapper around Octokit that makes calls as an installation.

```ruby
module GithubApp
  class Client
    def initialize(installation)
      @installation = installation
    end

    def list_pulls(owner:, repo:, state: "all", since: nil)
      client.pull_requests("#{owner}/#{repo}", state: state).select do |pr|
        since.nil? || pr[:updated_at] >= since
      end
    end

    def list_pull_reviews(owner:, repo:, number:)
      client.pull_request_reviews("#{owner}/#{repo}", number)
    end

    def list_check_suites(owner:, repo:, ref:)
      client.check_suites_for_ref("#{owner}/#{repo}", ref)
    end

    def list_repositories
      # /installation/repositories is the installation-scoped repo list
      client.get("/installation/repositories")[:repositories]
    end

    private

    def client
      @client ||= Octokit::Client.new(
        access_token: GithubApp::InstallationToken.fetch(@installation.github_installation_id),
        auto_paginate: true
      )
    end
  end
end
```

### New controller: `GithubApp::InstallationsController`

Two endpoints: one to kick off the install, one to handle the callback.

```ruby
module GithubApp
  class InstallationsController < ApplicationController
    include ActionController::Cookies

    before_action :require_session_auth_or_redirect!, only: [:new, :callback]

    # GET /github/installations/new?org_slug=<slug>
    # Redirects the admin to the GitHub App install URL with the org slug
    # encoded in state. Admin-only.
    def new
      org = Organization.find_by!(slug: params[:org_slug])
      unless current_user.admin_or_owner_of?(org)
        return head :forbidden
      end

      state = sign_state(org.slug)
      slug = ENV.fetch("GITHUB_APP_SLUG")
      redirect_to "https://github.com/apps/#{slug}/installations/new?state=#{state}",
                  allow_other_host: true
    end

    # GET /github/installations/callback?installation_id=N&state=...
    # GitHub sends the admin back here after a successful install.
    def callback
      slug = verify_state!(params[:state])
      org  = Organization.find_by!(slug: slug)

      installation_id = params[:installation_id]&.to_i
      return redirect_with_error(org, "missing_installation_id") unless installation_id

      installation = GithubInstallation.find_or_initialize_by(
        github_installation_id: installation_id
      )

      # Fetch full installation details from GitHub to validate and populate.
      remote = fetch_installation_details(installation_id)
      return redirect_with_error(org, "api_error") unless remote

      installation.assign_attributes(
        organization:           org,
        account_login:          remote[:account][:login],
        account_type:           remote[:account][:type],
        target_type:            remote[:target_type],
        repository_selection:   remote[:repository_selection],
        permissions:            remote[:permissions].to_h,
        events:                 remote[:events],
        installed_by:           current_user,
        installed_at:           installation.installed_at || Time.current,
        status:                 "active"
      )
      installation.save!

      # Kick off the initial backfill asynchronously so the redirect is fast.
      GithubApp::BackfillInstallationJob.perform_later(installation.id)

      dashboard = ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
      redirect_to "#{dashboard}/#{org.slug}/settings?installed=true",
                  allow_other_host: true
    end

    private

    def require_session_auth_or_redirect!
      token = request.headers["X-Ax-Session"] || cookies[:_ax_session]
      session = UserSession.active.find_by(session_token: token) if token.present?
      @current_user = session&.user

      unless @current_user
        dashboard = ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
        return redirect_to "#{dashboard}/login", allow_other_host: true
      end
    end

    def current_user
      @current_user
    end

    def sign_state(slug)
      MessageVerifier.generate(slug, purpose: :github_install, expires_in: 10.minutes)
    end

    def verify_state!(signed_state)
      MessageVerifier.verify(signed_state, purpose: :github_install)
    end

    def fetch_installation_details(installation_id)
      jwt = GithubApp::JwtGenerator.generate
      Octokit::Client.new(bearer_token: jwt).get("/app/installations/#{installation_id}")
    rescue Octokit::Error => e
      Rails.logger.error("[github-app] failed to fetch installation #{installation_id}: #{e}")
      nil
    end

    def redirect_with_error(org, code)
      dashboard = ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
      redirect_to "#{dashboard}/#{org.slug}/settings?installed=false&error=#{code}",
                  allow_other_host: true
    end
  end
end
```

The `MessageVerifier` helper wraps `Rails.application.message_verifier(:github_install)` — a standard Rails pattern for short-lived signed tokens. This prevents a drive-by attacker from starting an install flow for an org they do not admin.

**Note on auth:** the install flow involves a cross-origin browser redirect, so we cannot rely on the `X-Ax-Session` header pattern the dashboard→Rails API uses. The callback comes in as a top-level browser navigation. The options are:

1. **Encode session into state.** Sign the `_ax_session` token alongside the org slug. The verifier checks both before acting. Fast, stateless.
2. **Redirect through the dashboard first.** Have the button in `/{slug}/settings` POST to the dashboard, which calls the Rails API to generate the signed state, then redirects the browser to GitHub with it. The dashboard owns the session cookie on its own origin.

**Recommended: option 2.** It keeps Rails from ever touching the dashboard's session cookie and aligns with the rest of the auth architecture. Dashboard has a server action or route handler that:

- Reads `_ax_session` from its own cookie jar
- Calls `POST /api/v1/orgs/:slug/github/install-url` (new, session-authed) on Rails
- Rails returns `{ install_url: "https://github.com/apps/..." }`
- Dashboard redirects the browser there

Then only the *callback* from GitHub is a direct browser→Rails navigation, and the Rails callback handler does not need a session at all — it just verifies the state token, which was issued by Rails moments earlier and proves the dashboard-authenticated user initiated the flow.

This is cleaner. Updated controller sketch:

```ruby
# POST /api/v1/orgs/:slug/github/install-url — session-authed
# Returns a signed install URL for the admin to follow.
module Api::V1
  class GithubInstallationsController < BaseController
    before_action :require_session_auth!
    before_action :find_org_as_admin!

    def create
      state = MessageVerifier.generate(
        { org: @org.slug, user: current_user.id },
        purpose: :github_install,
        expires_in: 10.minutes
      )
      slug = ENV.fetch("GITHUB_APP_SLUG")
      render json: {
        install_url: "https://github.com/apps/#{slug}/installations/new?state=#{state}"
      }
    end
  end
end

# GET /github/installations/callback — no session required, state is the proof
module GithubApp
  class InstallationsController < ApplicationController
    def callback
      decoded = MessageVerifier.verify(params[:state], purpose: :github_install)
      org = Organization.find_by!(slug: decoded[:org])
      installer = User.find(decoded[:user])
      # ... rest unchanged, using `installer` instead of `current_user`
    end
  end
end
```

### Webhook routing updates

`ProcessGitHubWebhookJob` currently handles `pull_request`, `pull_request_review`, and `check_suite`. Extend it to also handle `installation` and `installation_repositories`, and to look up the installation record for every event and reject anything we can't map.

```ruby
class ProcessGitHubWebhookJob < ApplicationJob
  queue_as :webhooks

  def perform(event_type, payload_json)
    payload = JSON.parse(payload_json, symbolize_names: true)

    # Installation lifecycle events take precedence — they may create or
    # destroy the installation row used by other event types.
    return handle_installation(payload) if event_type == "installation"
    return handle_installation_repositories(payload) if event_type == "installation_repositories"

    installation_id = payload.dig(:installation, :id)
    installation = GithubInstallation.active.find_by(github_installation_id: installation_id)
    unless installation
      Rails.logger.warn("[webhooks] received #{event_type} for unknown installation #{installation_id}")
      return
    end

    case event_type
    when "pull_request"
      handle_pull_request(payload, installation)
    when "pull_request_review"
      handle_review(payload, installation)
    when "check_suite"
      handle_check_suite(payload, installation)
    when "push"
      handle_push(payload, installation)  # if we wire it up; initially noop
    end
  end

  private

  def handle_installation(payload)
    action = payload[:action]
    installation_data = payload[:installation]

    case action
    when "created"
      # The setup-URL callback may have already created the row. Upsert.
      WebhookHandlers::InstallationCreated.new(installation_data).call
    when "deleted"
      WebhookHandlers::InstallationDeleted.new(installation_data).call
    when "suspend"
      WebhookHandlers::InstallationSuspend.new(installation_data).call
    when "unsuspend"
      WebhookHandlers::InstallationUnsuspend.new(installation_data).call
    end
  end

  def handle_installation_repositories(payload)
    WebhookHandlers::InstallationRepositories.new(payload).call
  end

  # ... existing handlers gain an `installation` kwarg they can ignore for now
end
```

### New webhook handlers

- `WebhookHandlers::InstallationCreated` — upsert `GithubInstallation` row (the setup-URL callback may have beaten the webhook; that's fine, we reconcile).
- `WebhookHandlers::InstallationDeleted` — mark `status = "deleted"`, null out `organization_id`.
- `WebhookHandlers::InstallationSuspend` — mark `status = "suspended"`.
- `WebhookHandlers::InstallationUnsuspend` — mark `status = "active"`.
- `WebhookHandlers::InstallationRepositories` — on `added`, upsert `Repo` rows scoped to this installation's `organization`; on `removed`, detach the `github_installation_id` but leave the `Repo` row intact (historical metrics survive uninstall).

### Backfill job

```ruby
class GithubApp::BackfillInstallationJob < ApplicationJob
  queue_as :default

  def perform(installation_id)
    installation = GithubInstallation.find(installation_id)
    return unless installation.active?

    client = GithubApp::Client.new(installation)
    since  = ENV.fetch("GITHUB_APP_BACKFILL_DAYS", "90").to_i.days.ago

    client.list_repositories.each do |gh_repo|
      repo = upsert_repo(installation, gh_repo)
      backfill_repo(client, repo, since)
    end

    installation.update!(last_synced_at: Time.current)
  rescue => e
    Rails.logger.error("[github-app] backfill failed for installation #{installation_id}: #{e.class}: #{e.message}")
    raise
  end

  private

  def upsert_repo(installation, gh_repo)
    Repo.find_or_initialize_by(
      github_owner: gh_repo[:owner][:login],
      github_repo:  gh_repo[:name]
    ).tap do |r|
      r.organization = installation.organization
      r.github_installation_id = installation.id
      r.path ||= "#{gh_repo[:owner][:login]}/#{gh_repo[:name]}"
      r.save!
    end
  end

  def backfill_repo(client, repo, since)
    pulls = client.list_pulls(
      owner: repo.github_owner,
      repo:  repo.github_repo,
      state: "all",
      since: since
    )

    pulls.each do |pr|
      # Upsert the PR row, then run the normal webhook handlers so metrics
      # computation stays on one code path.
      ::WebhookHandlers::PrOpened.new(pr, pr[:base][:repo]).call
      ::WebhookHandlers::PrMerged.new(pr, pr[:base][:repo]).call if pr[:merged_at]
      ::WebhookHandlers::PrClosed.new(pr, pr[:base][:repo]).call if pr[:closed_at] && !pr[:merged_at]
    end
  end
end
```

(The reuse-the-webhook-handler pattern keeps metric computation in one place.)

### Signature validation with per-installation secret

Update `WebhooksController#valid_github_signature?` to look up the installation first and prefer its webhook secret. For installation lifecycle events that arrive before the installation row exists, fall back to the env var.

```ruby
def valid_github_signature?
  payload = request.raw_post
  signature = request.headers["X-Hub-Signature-256"]
  return false if signature.blank?

  secret = resolve_secret(payload)
  return false if secret.blank?

  expected = "sha256=" + OpenSSL::HMAC.hexdigest("sha256", secret, payload)
  ActiveSupport::SecurityUtils.secure_compare(expected, signature)
end

def resolve_secret(raw_payload)
  payload = JSON.parse(raw_payload, symbolize_names: true) rescue {}
  installation_id = payload.dig(:installation, :id)
  if installation_id
    installation = GithubInstallation.find_by(github_installation_id: installation_id)
    return installation.webhook_secret if installation&.webhook_secret.present?
  end
  ENV["GITHUB_APP_WEBHOOK_SECRET"] || ENV["AX_WEBHOOK_GITHUB_SECRET"]
end
```

### Routes

```ruby
# config/routes.rb additions

# Browser-facing GitHub App install callback (no session required,
# state token is the authorization)
get "/github/installations/callback", to: "github_app/installations#callback"

namespace :api do
  namespace :v1 do
    resources :orgs, param: :slug, only: [:index, :create] do
      resource :github_installation, only: [:show, :destroy], controller: "github_installations" do
        post :install_url
      end
      # ... existing nested resources
    end
  end
end
```

`GET /api/v1/orgs/:slug/github_installation` returns the current installation state (active / missing / suspended) for the settings page. `POST :install_url` returns the signed install URL. `DELETE` triggers a client-side redirect to GitHub's uninstall page (we cannot uninstall ourselves — only the GitHub org admin can).

## Dashboard Changes

### `/{slug}/settings` page — real implementation

This page is currently a placeholder. To ship the install flow it needs enough UI to render the install state and a button.

Minimal content:

1. **GitHub App integration card**
   - If no installation: "Connect your GitHub organization to AX" + **Install GitHub App** button. Clicking calls `POST /api/v1/orgs/:slug/github_installation/install_url`, reads the returned URL, and redirects the browser.
   - If installation is active: "Installed on `<account_login>` — `<count>` repositories, last synced `<relative time>`" + Manage on GitHub link + Uninstall instructions.
   - If installation is suspended: warning banner + Resume on GitHub link.
2. **`?installed=true` flash.** When the query param is present, show a success toast and strip the param from the URL.
3. **`?installed=false&error=<code>` flash.** Show a dismissible error banner explaining which step failed and linking to setup docs.

### `/{slug}/settings` routing / membership checks

Only admins and owners can see the Install button; members see a read-only version.

### Data layer additions

- `getGithubInstallation(orgSlug)` in `dashboard/src/lib/db.ts` (managed mode only) — fetches the installation state via the new API endpoint.
- `requestGithubInstallUrl(orgSlug)` — POSTs to `/api/v1/orgs/:slug/github_installation/install_url` and returns the URL.

## Implementation Phases

Each phase is independently landable and leaves the app in a working state.

### Phase 1 — Data model and env var wiring

- Create the `github_installations` migration and model.
- Add `github_installation_id` column to `repos`.
- Add the env vars (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_SLUG`) as blank values on Railway. Do not require them at boot — missing values should noop feature checks, not crash the app.
- Create the GitHub App on GitHub (manual). Save credentials to Railway.
- Verification: `GithubInstallation.new` works; boot does not crash.

### Phase 2 — JWT, installation tokens, Octokit client

- Add `jwt` and `octokit` to the Gemfile.
- Implement `GithubApp::JwtGenerator`, `GithubApp::InstallationToken`, `GithubApp::Client`.
- Unit tests against a fake HTTP fixture (WebMock).
- Verification: in a Rails console on Railway, `GithubApp::InstallationToken.fetch(<real_id>)` returns a working token and a call like `GithubApp::Client.new(real_installation).list_repositories` returns repos.

### Phase 3 — Install flow

- Add routes: `GET /github/installations/callback`, `POST /api/v1/orgs/:slug/github_installation/install_url`, `GET /api/v1/orgs/:slug/github_installation`.
- Implement `Api::V1::GithubInstallationsController` and `GithubApp::InstallationsController`.
- Implement signed-state helper.
- Dashboard: minimal `/{slug}/settings` page with the Install button.
- Verification: full happy path manually, from settings button → GitHub → back to dashboard. Installation row persists.

### Phase 4 — Webhook routing for installation events

- Extend `ProcessGitHubWebhookJob` with install/repositories handlers.
- Add `WebhookHandlers::InstallationCreated`, `InstallationDeleted`, `InstallationSuspend`, `InstallationUnsuspend`, `InstallationRepositories`.
- Update `WebhooksController#valid_github_signature?` to use per-installation secrets.
- Verification: uninstall the app from GitHub, confirm the installation row transitions to `deleted` via webhook. Reinstall, confirm it reactivates.

### Phase 5 — Installation-scoped webhook processing

- Existing `pull_request` / `pull_request_review` / `check_suite` handlers gain an `installation` kwarg and accept only events from known active installations.
- `find_repo` in `WebhookHandlers::Base` now prefers repos scoped to the installation's org.
- Verification: trigger a PR event on a repo that belongs to an installed org; confirm it updates. Trigger on a repo in an uninstalled org; confirm it is dropped with a warning.

### Phase 6 — Backfill job

- Implement `GithubApp::BackfillInstallationJob`.
- Kick off from the install callback after saving the installation.
- Add retry/exponential backoff for rate-limit errors.
- Verification: install on an org with a known PR history, then check the dashboard — finalized PRs from the last 90 days appear without anyone running `ax push`.

### Phase 7 — Dashboard settings page polish

- Settings page shows current installation state, last sync time, connected repos.
- Toast messaging for success/error query params.
- "Reinstall" flow for suspended installations.
- Verification: manual QA on all three states (missing / active / suspended).

### Phase 8 — Docs update

- Extend `docs/setup.md` with a GitHub App installation section (the first version of that doc called this out as "not yet built" — update it to reflect reality).
- Add a troubleshooting entry for install-flow failures (error query param codes explained).
- Update ADR-013's "Implementation is staged" list to mark the relevant items done.

## Key Design Decisions

1. **Install flow is dashboard-initiated, Rails-owned.** The dashboard mints the install URL via an authenticated API call; the Rails callback has no cookie dependency and trusts a short-lived signed state token as proof.
2. **One GitHub App for everything.** Not per-environment, not per-org. Dev/staging use the same app with a different Railway project + different webhook destination, or a separate app if isolation matters.
3. **CLI push keeps working.** Everything in this plan adds capability rather than removing any existing path. Developers can install the app on their personal account or not — either way, local sync + push still works.
4. **Backfill reuses webhook handlers.** Metric computation is one code path. We fetch PRs from GitHub and then run them through `PrOpened`/`PrMerged`/`PrClosed` handlers instead of writing a second ingestion path.
5. **Installation-scoped webhook validation.** Receiving a valid HMAC proves the sender knows the secret but does not prove org authorization. The `installation.id` lookup after signature validation is the actual authorization step.
6. **Repos survive uninstall.** Uninstalling just detaches the `github_installation_id` and marks the installation `deleted`. Historical PRs and metrics remain, matching how most SaaS integrations handle uninstalls.

## Open Questions

1. **Should we auto-create repos from the backfill, or require an explicit user action?** Current plan: auto-create. Concern: org admin installs on "all repositories", we pull 200 repos, most of which have no Claude Code activity. Option: only auto-create repos that have at least one finalized PR in the backfill window.
2. **Do we let users uninstall from the dashboard directly?** GitHub does not support programmatic uninstallation. Current plan: a link to the org's app-installation settings page on GitHub (e.g. `https://github.com/organizations/<org>/settings/installations/<id>`).
3. **What happens if an admin installs the app on a GitHub org that no AX org corresponds to?** The callback validates the state token has an AX org slug. If the user picked a different GitHub org during install, we see a mismatch between `state.org` and `remote.account.login`. Options: reject with an error, or auto-create an AX org. Current plan: reject, point user at the "Create new org" flow.
4. **Rate-limit strategy.** The backfill job can easily hit rate limits on large orgs. Do we implement progressive backfill (walk PRs in batches, checkpoint by `updated_at`), or process the whole thing in one job and let Sidekiq retries handle failures? Current plan: start simple, add checkpointing if needed.
5. **Should the webhook handler start using installation tokens to fetch additional data (full PR body, file changes, linked commits)?** Most metric computation only needs what the webhook payload already provides. Deferred unless we find a specific metric that needs it.
6. **Repo deduplication vs. CLI-pushed repos.** If a repo already exists in the DB (created via `ax push` before installation) and then an installation lands that covers the same repo, the upsert by `(github_owner, github_repo)` does the right thing. Confirm the `repos.path` uniqueness constraint does not bite us.

## Potential Challenges

- **Webhook delivery timing.** The setup URL callback and the `installation.created` webhook can arrive in either order; both handlers must be idempotent and converge to the same state.
- **Private key handling in Railway env vars.** PEM with literal newlines sometimes needs `\n` escaping depending on the provider. Test `GITHUB_APP_PRIVATE_KEY` parsing on boot with a deliberate canary log line.
- **Octokit 9.x vs newer API surface.** If the Octokit version's `create_app_installation_access_token` or `pull_requests` signatures differ from the sketches above, adjust accordingly. Lock a specific minor version.
- **Sidekiq queue partitioning.** `process_git_hub_webhook_job` currently uses `queue_as :webhooks`. Make sure the backfill job lives on `:default` (or a new `:backfill` queue) so a slow backfill does not block low-latency webhook processing.
- **Settings page shipping alongside the rest of the placeholder UI.** The settings page is currently a full placeholder; building just the GitHub App card without the rest of the settings UI is fine but risks looking incomplete. Option: build the whole settings page (profile, org name, members) as a separate chunk first, then the GitHub App card lands into a real frame.

## Critical Files for Implementation

**Rails — new:**
- `server/db/migrate/<next>_create_github_installations.rb`
- `server/db/migrate/<next>_add_github_installation_to_repos.rb`
- `server/app/models/github_installation.rb`
- `server/app/services/github_app/jwt_generator.rb`
- `server/app/services/github_app/installation_token.rb`
- `server/app/services/github_app/client.rb`
- `server/app/services/github_app/backfill_installation_job.rb` (or `jobs/`)
- `server/app/controllers/github_app/installations_controller.rb`
- `server/app/controllers/api/v1/github_installations_controller.rb`
- `server/app/services/webhook_handlers/installation_created.rb`
- `server/app/services/webhook_handlers/installation_deleted.rb`
- `server/app/services/webhook_handlers/installation_suspend.rb`
- `server/app/services/webhook_handlers/installation_unsuspend.rb`
- `server/app/services/webhook_handlers/installation_repositories.rb`

**Rails — modified:**
- `server/Gemfile` — add `jwt`, `octokit`
- `server/config/routes.rb` — new install and API routes
- `server/app/controllers/webhooks_controller.rb` — per-installation secret
- `server/app/jobs/process_git_hub_webhook_job.rb` — installation event routing
- `server/app/services/webhook_handlers/base.rb` — installation-scoped repo lookup
- `server/app/models/repo.rb` — `belongs_to :github_installation`

**Dashboard — new:**
- `dashboard/src/app/[slug]/settings/page.tsx` — rewrite from placeholder
- `dashboard/src/lib/github-install.ts` — helper for install URL fetching

**Dashboard — modified:**
- `dashboard/src/lib/db.ts` — `getGithubInstallationAsync(orgSlug)`

**Docs — modified:**
- `docs/setup.md` — GitHub App install section
- `docs/decisions/013-github-integration-model.md` — mark items done

## Estimated Scope

- **Phase 1 (data model):** small
- **Phase 2 (token machinery):** small-to-medium (JWT + HTTP is uncomplicated; tests are the work)
- **Phase 3 (install flow):** medium (two controllers + dashboard page)
- **Phase 4 (installation webhook routing):** small-to-medium (five new thin handlers)
- **Phase 5 (scoped webhook processing):** small
- **Phase 6 (backfill):** medium (retries and idempotency are the hard part)
- **Phase 7 (settings page polish):** medium-to-large (depends on how much of the settings UI gets built alongside it)
- **Phase 8 (docs):** small

The whole plan is landable as separate PRs matching the phases. Phases 1–5 unlock basic "webhooks route to the right org" — shipping through Phase 5 gives you real value. Phase 6 (backfill) is the biggest lift and the highest-impact for "new org sees something on the dashboard right away."
