# Plan: Managed Service Identity (Flows 1 & 2)

## Context

AX is moving to a two-mode architecture: **local** (Go CLI + SQLite) and **managed** (Rails API at `app.ax.dev` + Next.js dashboard). There is no self-hosted server option. See `plans/rails-migration.md` for the full migration plan.

The managed service needs a multi-tenant identity foundation — organizations, users, memberships, invites, and scoped API keys.

This plan covers **Flow 1** (register new organization) and **Flow 2** (add user to organization). It is independent of **Flow 3** (repository registration), which will add `org_id` to the `repos` table and handle GitHub App integration separately.

**Key decisions already made:**
- Many-to-many user ↔ org relationship via memberships
- Personal org auto-created on signup (slug = GitHub username)
- One API key per user; server resolves org from registered repo at push time
- Roles on membership: owner (one per org), admin, member
- Org is the future billing entity (billing deferred but model supports it)
- Slug-based org identity (lowercase alphanumeric + hyphens, 3–40 chars)
- Waitlist gates org creation; invited users join freely
- GitHub OAuth for identity (via Devise + OmniAuth)
- Invite via copyable link (no email infrastructure for MVP)
- Server is a Rails API app (no self-hosted Go server)

**Supersedes:** Parts of `plans/dashboard-auth.md` (auth tables, OAuth flow, session management). The GitHub OAuth mechanics and session cookie approach from that plan still apply, but the data model is richer.

## Architecture Overview

```
Browser                        Rails API (app.ax.dev)         GitHub API
  │                                │                              │
  │  GET /auth/github              │                              │
  │───────────────────────────────>│                              │
  │  302 → github.com/login/...   │                              │
  │<───────────────────────────────│                              │
  │                                │                              │
  │  GET /auth/github/callback     │                              │
  │───────────────────────────────>│  exchange code → token       │
  │                                │─────────────────────────────>│
  │                                │  GET /user                   │
  │                                │─────────────────────────────>│
  │                                │  { login, email, avatar }    │
  │                                │<─────────────────────────────│
  │                                │                              │
  │                                │  upsert user                 │
  │                                │  create personal org (first  │
  │                                │    login only)               │
  │                                │  check pending invites →     │
  │                                │    auto-join orgs            │
  │                                │  create session              │
  │                                │                              │
  │  Set-Cookie: _ax_session=...   │                              │
  │  302 → /                       │                              │
  │<───────────────────────────────│                              │
  │                                │                              │
  │  All API calls                 │                              │
  │  Cookie: _ax_session=...       │                              │
  │───────────────────────────────>│  session → user → org        │
  │  200 { data }                  │  (org from URL or switcher)  │
  │<───────────────────────────────│                              │


CLI Push Flow:
  ax push --repo .
  │  Authorization: Bearer ax_k1_...
  │──────────────────────────────>│  key → user
  │                               │  repo remote_url → org (via registered repos)
  │                               │  validate user ∈ org
  │                               │  store data under org
  │  200 OK                       │
  │<──────────────────────────────│
```

## Data Model

### Rails Migrations

```ruby
# Identity tables — create via Rails migrations in server/db/migrate/

class CreateUsers < ActiveRecord::Migration[7.1]
  def change
    create_table :users do |t|
      t.bigint  :github_id, null: false, index: { unique: true }
      t.string  :github_username, null: false
      t.string  :email
      t.string  :display_name
      t.string  :avatar_url
      t.datetime :last_login_at, null: false, default: -> { "NOW()" }
      t.timestamps
    end
  end
end

class CreateOrganizations < ActiveRecord::Migration[7.1]
  def change
    create_table :organizations do |t|
      t.string  :slug, null: false, index: { unique: true }
      t.string  :name, null: false
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.boolean :is_personal, null: false, default: false
      t.timestamps
    end
  end
end

class CreateOrgMemberships < ActiveRecord::Migration[7.1]
  def change
    create_table :org_memberships do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :role, null: false  # owner, admin, member
      t.references :invited_by, foreign_key: { to_table: :users }
      t.datetime :joined_at, null: false, default: -> { "NOW()" }
      t.timestamps
    end

    add_index :org_memberships, [:organization_id, :user_id], unique: true
  end
end

class CreateInvites < ActiveRecord::Migration[7.1]
  def change
    create_table :invites do |t|
      t.references :organization, null: false, foreign_key: true
      t.string :github_username, null: false, index: true
      t.string :role, null: false  # admin, member
      t.references :invited_by, null: false, foreign_key: { to_table: :users }
      t.string :token, null: false, index: { unique: true }
      t.string :status, null: false, default: "pending"  # pending, accepted, expired, revoked
      t.datetime :expires_at, null: false
      t.datetime :accepted_at
      t.timestamps
    end

    add_index :invites, [:organization_id, :github_username, :status], unique: true
  end
end

class CreateUserSessions < ActiveRecord::Migration[7.1]
  def change
    create_table :user_sessions do |t|
      t.string :session_token, null: false, index: { unique: true }
      t.references :user, null: false, foreign_key: true
      t.datetime :expires_at, null: false, index: true
      t.string :user_agent
      t.string :ip_address
      t.timestamps
    end
  end
end

class CreateWaitlist < ActiveRecord::Migration[7.1]
  def change
    create_table :waitlist_entries do |t|
      t.string :email, null: false, index: true
      t.string :github_username, index: true
      t.string :status, null: false, default: "waiting"  # waiting, approved, joined
      t.datetime :approved_at
      t.timestamps
    end
  end
end

class CreateApiKeys < ActiveRecord::Migration[7.1]
  def change
    create_table :api_keys do |t|
      t.references :user, null: false, foreign_key: true
      t.string :key_hash, null: false
      t.string :name
      t.datetime :last_used_at
      t.boolean :revoked, null: false, default: false
      t.timestamps
    end
  end
end
```

### Rails Models

```ruby
class User < ApplicationRecord
  has_many :org_memberships, dependent: :destroy
  has_many :organizations, through: :org_memberships
  has_one  :api_key, -> { where(revoked: false) }, dependent: :destroy
  has_many :user_sessions, dependent: :destroy

  validates :github_id, presence: true, uniqueness: true
  validates :github_username, presence: true

  def personal_org
    organizations.find_by(is_personal: true)
  end

  def member_of?(org)
    org_memberships.exists?(organization: org)
  end

  def role_in(org)
    org_memberships.find_by(organization: org)&.role
  end

  def admin_or_owner_of?(org)
    org_memberships.exists?(organization: org, role: %w[admin owner])
  end
end

class Organization < ApplicationRecord
  has_many :org_memberships, dependent: :destroy
  has_many :users, through: :org_memberships
  has_many :repos, dependent: :destroy
  has_many :invites, dependent: :destroy
  belongs_to :created_by, class_name: "User"

  validates :slug, presence: true, uniqueness: true,
            format: { with: /\A[a-z][a-z0-9-]*[a-z0-9]\z/ },
            length: { in: 3..40 }
  validate :slug_not_reserved
  validate :no_consecutive_hyphens

  RESERVED_SLUGS = %w[
    admin api app auth billing dashboard docs help internal
    login logout new null settings status support system
    undefined webhook webhooks www
  ].freeze

  private

  def slug_not_reserved
    errors.add(:slug, "is reserved") if RESERVED_SLUGS.include?(slug)
  end

  def no_consecutive_hyphens
    errors.add(:slug, "cannot contain consecutive hyphens") if slug&.include?("--")
  end
end

class OrgMembership < ApplicationRecord
  belongs_to :organization
  belongs_to :user
  belongs_to :invited_by, class_name: "User", optional: true

  validates :role, inclusion: { in: %w[owner admin member] }
  validates :user_id, uniqueness: { scope: :organization_id }
end

class Invite < ApplicationRecord
  belongs_to :organization
  belongs_to :invited_by, class_name: "User"

  validates :github_username, presence: true
  validates :role, inclusion: { in: %w[admin member] }
  validates :token, presence: true, uniqueness: true
  validates :status, inclusion: { in: %w[pending accepted expired revoked] }

  scope :pending, -> { where(status: "pending").where("expires_at > ?", Time.current) }

  before_validation :generate_token, on: :create
  before_validation :set_expiry, on: :create

  def accept!(user)
    transaction do
      update!(status: "accepted", accepted_at: Time.current)
      OrgMembership.create!(
        organization: organization,
        user: user,
        role: role,
        invited_by: invited_by
      )
    end
  end

  def expired?
    expires_at < Time.current
  end

  private

  def generate_token
    self.token ||= SecureRandom.hex(32)
  end

  def set_expiry
    self.expires_at ||= 7.days.from_now
  end
end

class ApiKey < ApplicationRecord
  belongs_to :user

  validates :key_hash, presence: true

  PREFIX = "ax_k1_"

  def self.generate_for(user)
    raw_key = "#{PREFIX}#{SecureRandom.hex(32)}"
    create!(user: user, key_hash: BCrypt::Password.create(raw_key))
    raw_key  # return raw key once; it cannot be retrieved later
  end

  def self.authenticate(raw_key)
    return nil unless raw_key&.start_with?(PREFIX)

    # Check all non-revoked keys (there should be at most one per user)
    where(revoked: false).find_each do |key|
      if BCrypt::Password.new(key.key_hash) == raw_key
        key.touch(:last_used_at)
        return key
      end
    end

    nil
  end
end
```

### Slug Validation Rules

- Lowercase alphanumeric and hyphens only: `^[a-z][a-z0-9-]*[a-z0-9]$`
- Length: 3–40 characters
- Cannot start or end with a hyphen
- Cannot contain consecutive hyphens
- Reserved words: `admin`, `api`, `app`, `auth`, `billing`, `dashboard`, `docs`, `help`, `internal`, `login`, `logout`, `new`, `null`, `settings`, `status`, `support`, `system`, `undefined`, `webhook`, `webhooks`, `www`

## Auth Flows

### First-Time Signup (Waitlisted)

1. User visits `app.ax.dev` → sees landing page with "Join Waitlist"
2. Submits email (+ optional GitHub username) → `waitlist_entries` row created
3. Admin approves them (flips status to `approved`, they receive notification however we choose)
4. User clicks "Get Started" link → redirected to `/auth/github`
5. GitHub OAuth → Devise/OmniAuth callback → Rails creates `User` record
6. Rails auto-creates personal org: slug = GitHub username, `is_personal = TRUE`, user is `owner`
7. Rails checks for pending invites matching this GitHub username → auto-accepts them, creates `OrgMembership` records
8. Rails creates session → sets cookie → redirects to dashboard
9. Dashboard shows first-time experience: API key display + `ax init` instructions

### Returning Login

1. User visits `app.ax.dev` → redirected to `/auth/github` (or auto-logged in if session cookie valid)
2. GitHub OAuth → Devise/OmniAuth callback → Rails upserts `User` record (updates `last_login_at`, `avatar_url`, etc.)
3. Rails checks for any new pending invites → auto-accepts
4. Creates session → cookie → dashboard

### Invite Flow

1. Org admin/owner opens org settings → "Invite Member"
2. Enters GitHub username and role (admin or member)
3. Rails creates `Invite` with random token, `expires_at` = now + 7 days
4. Dashboard shows copyable invite link: `app.ax.dev/invite/{token}`
5. Invitee clicks link:
   - **Already logged in**: Rails validates token → creates `OrgMembership` → redirects to org dashboard
   - **Not logged in**: Rails stores invite token in a short-lived cookie → redirects to GitHub OAuth → on callback, processes the invite after creating/finding the user
   - **No AX account**: Same as "not logged in" — account is created during OAuth callback, then invite is processed

### API Key Provisioning

- A user's API key is generated once and shown on first login (and accessible later from user settings)
- Keys are scoped to the user (`api_keys.user_id`), not to any org
- Format: `ax_k1_` + 32 hex chars (unchanged from Go implementation)
- User can rotate their key from settings (old key immediately invalidated)
- Key display page shows the `ax init` command pre-filled:
  ```
  ax init --team https://api.ax.dev --api-key ax_k1_... --user "Display Name"
  ```

## Server Implementation (Rails)

### Controllers

```ruby
# Auth (Devise + OmniAuth)
class Auth::OmniauthCallbacksController < Devise::OmniauthCallbacksController
  def github
    user = AuthService.find_or_create_from_github(auth_hash)
    session = UserSession.create_for(user, request)
    cookies.signed[:_ax_session] = { value: session.session_token, httponly: true, secure: true }
    redirect_to after_sign_in_path(user)
  end

  private

  def auth_hash
    request.env["omniauth.auth"]
  end

  def after_sign_in_path(user)
    if user.previously_new_record?
      "/onboarding"
    else
      "/#{user.personal_org.slug}"
    end
  end
end

# Waitlist (public, rate-limited)
class WaitlistController < ApplicationController
  def create
    WaitlistEntry.create!(waitlist_params)
    head :created
  end
end

# Invites (browser flow)
class InvitesController < ApplicationController
  def show
    invite = Invite.pending.find_by!(token: params[:token])

    if current_user
      invite.accept!(current_user)
      redirect_to "/#{invite.organization.slug}"
    else
      cookies.signed[:pending_invite] = { value: invite.token, expires: 1.hour }
      redirect_to "/auth/github"
    end
  end
end

# Org management
class Api::V1::OrganizationsController < Api::V1::BaseController
  before_action :require_session_auth!

  def index
    orgs = current_user.organizations
    render json: orgs
  end

  def show
    org = current_user.organizations.find_by!(slug: params[:slug])
    render json: org
  end

  def create
    AuthService.ensure_can_create_org!(current_user)
    org = OrgService.create_org(current_user, org_params)
    render json: org, status: :created
  end

  def update
    org = find_org_as_admin!
    org.update!(org_params)
    render json: org
  end
end

# Members
class Api::V1::MembersController < Api::V1::BaseController
  before_action :require_session_auth!
  before_action :find_org_as_admin!

  def index
    render json: @org.org_memberships.includes(:user)
  end

  def update
    membership = @org.org_memberships.find(params[:id])
    membership.update!(role: params[:role])
    render json: membership
  end

  def destroy
    membership = @org.org_memberships.find(params[:id])
    membership.destroy!
    head :no_content
  end
end

# Invite management
class Api::V1::OrgInvitesController < Api::V1::BaseController
  before_action :require_session_auth!
  before_action :find_org_as_admin!

  def index
    render json: @org.invites.pending
  end

  def create
    invite = @org.invites.create!(
      github_username: params[:github_username],
      role: params[:role],
      invited_by: current_user
    )
    render json: { token: invite.token, link: "https://app.ax.dev/invite/#{invite.token}" }, status: :created
  end

  def destroy
    invite = @org.invites.find(params[:id])
    invite.update!(status: "revoked")
    head :no_content
  end
end

# API key management
class Api::V1::ApiKeysController < Api::V1::BaseController
  before_action :require_session_auth!

  def show
    key = current_user.api_key
    render json: { name: key&.name, created_at: key&.created_at, last_used_at: key&.last_used_at }
  end

  def rotate
    current_user.api_key&.update!(revoked: true)
    raw_key = ApiKey.generate_for(current_user)
    render json: { key: raw_key }
  end
end
```

### Auth Middleware

Two auth paths coexist in the Rails app:

```ruby
class Api::V1::BaseController < ApplicationController
  private

  # Session auth — for dashboard (browser) requests
  def require_session_auth!
    token = cookies.signed[:_ax_session]
    session = UserSession.where("expires_at > ?", Time.current).find_by(session_token: token)
    @current_user = session&.user
    head :unauthorized unless @current_user
  end

  # API key auth — for CLI push requests
  def require_api_key_auth!
    raw_key = request.headers["Authorization"]&.delete_prefix("Bearer ")
    api_key = ApiKey.authenticate(raw_key)
    @current_user = api_key&.user
    head :unauthorized unless @current_user
  end

  def current_user
    @current_user
  end

  # Org context from URL slug
  def find_org!
    @org = Organization.find_by!(slug: params[:slug])
    head :forbidden unless current_user.member_of?(@org)
  end

  def find_org_as_admin!
    find_org!
    head :forbidden unless current_user.admin_or_owner_of?(@org)
  end
end
```

### Routes

```ruby
Rails.application.routes.draw do
  # Auth (Devise + OmniAuth)
  devise_for :users, controllers: { omniauth_callbacks: "auth/omniauth_callbacks" }
  get  "/auth/me", to: "auth/sessions#me"
  post "/auth/logout", to: "auth/sessions#destroy"

  # Public
  post "/waitlist", to: "waitlist#create"
  get  "/invite/:token", to: "invites#show"
  get  "/api/v1/health", to: "health#show"

  # Webhooks (signature-validated, not session/key auth)
  post "/webhooks/github", to: "webhooks#github"

  namespace :api do
    namespace :v1 do
      # Session-authenticated (dashboard)
      resources :orgs, param: :slug, only: [:index, :create] do
        member do
          get "/", to: "organizations#show"
          put "/", to: "organizations#update"
        end
        resources :members, only: [:index, :update, :destroy]
        resources :invites, controller: "org_invites", only: [:index, :create, :destroy]
        resources :repos, only: [:index] do
          member do
            get :prs
            get :metrics
            get :timeline
            get :repo_metrics
          end
        end
      end

      # User settings
      resource :api_key, only: [:show] do
        post :rotate
      end

      # API key-authenticated (CLI)
      post "/push", to: "push#create"

      # Watch status
      get "/watch-status", to: "watch_status#show"
    end
  end
end
```

### Services

```ruby
class AuthService
  def self.find_or_create_from_github(auth_hash)
    user = User.find_or_initialize_by(github_id: auth_hash.uid)
    user.update!(
      github_username: auth_hash.info.nickname,
      email: auth_hash.info.email,
      display_name: auth_hash.info.name,
      avatar_url: auth_hash.info.image,
      last_login_at: Time.current
    )

    if user.previously_new_record?
      create_personal_org(user)
      ApiKey.generate_for(user)  # shown on onboarding page
    end

    process_pending_invites(user)
    user
  end

  def self.ensure_can_create_org!(user)
    entry = WaitlistEntry.find_by(github_username: user.github_username, status: "approved")
    raise ForbiddenError, "Not approved to create organizations" unless entry
  end

  private

  def self.create_personal_org(user)
    slug = user.github_username.downcase
    # Handle slug conflicts with reserved words
    slug = "#{slug}-ax" if Organization::RESERVED_SLUGS.include?(slug)

    org = Organization.create!(
      slug: slug,
      name: user.display_name || user.github_username,
      created_by: user,
      is_personal: true
    )

    OrgMembership.create!(
      organization: org,
      user: user,
      role: "owner"
    )
  end

  def self.process_pending_invites(user)
    Invite.pending.where(github_username: user.github_username).find_each do |invite|
      invite.accept!(user)
    end
  end
end

class OrgService
  def self.create_org(user, params)
    org = Organization.create!(
      slug: params[:slug],
      name: params[:name],
      created_by: user
    )

    OrgMembership.create!(
      organization: org,
      user: user,
      role: "owner"
    )

    # Mark waitlist entry as joined
    WaitlistEntry
      .where(github_username: user.github_username, status: "approved")
      .update_all(status: "joined")

    org
  end
end
```

## Dashboard Changes

### New Pages

```
/login                          → Login page with "Sign in with GitHub" button
/invite/{token}                 → Invite acceptance (redirects to auth if needed)
/onboarding                     → First-time setup: shows API key + ax init command
/settings                       → User settings (API key, connected orgs)
/{slug}/settings                → Org settings (members, invites, org name)
/{slug}/settings/members        → Member management
```

### Org Switcher

Top of sidebar gets an org switcher dropdown (similar to Vercel/Linear):
- Shows current org name + avatar/icon
- Dropdown lists all orgs the user belongs to
- Selecting an org navigates to `/{slug}/` and all subsequent navigation stays within that org context

### Existing Pages Move Under Org Namespace

```
Current:    /prs, /prs/[id], /compare, /docs, /docs/[slug]
Becomes:    /{slug}/prs, /{slug}/prs/[id], /{slug}/compare, /{slug}/docs, ...
```

The root `/` redirects to the user's most recently viewed org, or their personal org if first visit.

## Implementation Phases

### Phase A: Rails Identity Models + Migrations

1. Create Rails migrations for `users`, `organizations`, `org_memberships`, `invites`, `user_sessions`, `waitlist_entries`, `api_keys`
2. Write ActiveRecord models with validations, associations, and scopes
3. Write model specs covering slug validation, invite acceptance, API key generation/authentication

### Phase B: Auth Core (Devise + OmniAuth)

1. Configure Devise with OmniAuth GitHub strategy
2. Implement `Auth::OmniauthCallbacksController` with signup flow:
   - Upsert user from GitHub profile
   - Auto-create personal org on first login
   - Process pending invites
   - Generate API key on first login
3. Implement `AuthService` with `find_or_create_from_github`, `ensure_can_create_org!`
4. Implement session-based auth middleware (`require_session_auth!`)
5. Implement API key auth middleware (`require_api_key_auth!`)
6. Configure CORS, cookie security, CSRF protection for API mode

### Phase C: Org & Invite Management Endpoints

1. Implement org CRUD endpoints under `/api/v1/orgs/`
2. Implement member management endpoints (list, update role, remove)
3. Implement invite creation, listing, revocation endpoints
4. Implement invite acceptance handler at `/invite/:token`
5. Implement API key show and rotation endpoints
6. Implement waitlist submission endpoint (public, rate-limited)

### Phase D: Dashboard Integration

1. Create login page (`/login`)
2. Create Next.js middleware for route protection (cookie check → redirect to /login)
3. Add org switcher component to sidebar
4. Move existing routes under `/{slug}/` namespace
5. Create onboarding page (API key display + setup instructions)
6. Create org settings pages (members, invites)
7. Create user settings page (API key management)
8. Update `db.ts` / `api.ts` to pass org context on all API calls

### Phase E: Data Endpoints Under Org Namespace

1. Implement org-scoped read endpoints:
   - `GET /api/v1/orgs/:slug/repos`
   - `GET /api/v1/orgs/:slug/repos/:id/prs`
   - `GET /api/v1/orgs/:slug/repos/:id/metrics`
   - `GET /api/v1/orgs/:slug/repos/:id/timeline`
   - `GET /api/v1/orgs/:slug/repos/:id/repo-metrics`
2. Add `organization_id` foreign key to `repos` table
3. Update push endpoint to resolve org from repo and validate user membership
4. All queries filter by org — no data leaks across organizations

## Key Design Decisions

1. **API key per user, not per org** — Simplifies local CLI config. Server resolves org from the registered repo. Tradeoff: push validation requires key → user → repo → org → membership lookup chain, but all are indexed queries.

2. **Personal org auto-created on signup** — Every user always has at least one org context. No special "individual" mode needed. Billing can treat personal orgs the same as team orgs (free tier vs paid).

3. **Invite by GitHub username, not email** — Since auth is GitHub-only, the username is the canonical identifier. Avoids email deliverability issues. The invite link is the delivery mechanism.

4. **Waitlist gates org creation, not user signup** — A user invited to an existing org can sign up freely (they're just joining). Only creating a *new* org requires waitlist approval. This lets teams onboard without friction while gating net-new orgs.

5. **Org context in URL path** — `/{slug}/prs` instead of a header or query param. Makes URLs shareable within a team and makes the current org visible in the browser. Matches Vercel, Linear, GitHub patterns.

6. **Devise + OmniAuth over hand-rolled auth** — Rails ecosystem handles OAuth, session management, CSRF, cookie security out of the box. No reason to reimplement.

7. **No self-hosted mode** — Two modes only: local (Go CLI + SQLite) and managed (Rails at app.ax.dev). Eliminates backward-compatibility complexity and the `AX_MANAGED` flag.

## Potential Challenges

- **Session + API key coexistence**: Two auth paths must not interfere. Dashboard routes accept only session cookies; CLI routes accept only API keys. The controller `before_action` chain must be strict about which applies where.
- **Slug conflicts**: GitHub usernames are taken as personal org slugs. If a user's GitHub username conflicts with a reserved word or an existing org slug, we need a fallback (append `-ax` or prompt them to choose).
- **Invite token security**: Tokens must be cryptographically random and single-use. The `accepted` status prevents replay. Use `SecureRandom.hex(32)`. Expired invites should be cleaned up by a Sidekiq job.
- **API key brute-force**: bcrypt comparison on every request is slow by design. Consider caching validated keys in Redis with short TTL to reduce per-request cost.

## Critical Files for Implementation

**Rails app (`server/`):**
- `app/models/user.rb` — User model with GitHub identity
- `app/models/organization.rb` — Org model with slug validation
- `app/models/org_membership.rb` — User ↔ org relationship
- `app/models/invite.rb` — Invite with token generation and acceptance
- `app/models/api_key.rb` — API key with bcrypt hashing
- `app/models/user_session.rb` — Browser session management
- `app/models/waitlist_entry.rb` — Waitlist gating
- `app/controllers/auth/omniauth_callbacks_controller.rb` — GitHub OAuth
- `app/controllers/api/v1/base_controller.rb` — Auth middleware
- `app/controllers/api/v1/organizations_controller.rb` — Org CRUD
- `app/controllers/api/v1/members_controller.rb` — Member management
- `app/controllers/api/v1/org_invites_controller.rb` — Invite management
- `app/controllers/api/v1/api_keys_controller.rb` — Key rotation
- `app/controllers/api/v1/push_controller.rb` — CLI push endpoint
- `app/controllers/webhooks_controller.rb` — GitHub webhook receiver
- `app/controllers/invites_controller.rb` — Invite acceptance (browser)
- `app/controllers/waitlist_controller.rb` — Public waitlist submission
- `app/services/auth_service.rb` — Signup flow orchestration
- `app/services/org_service.rb` — Org creation
- `app/services/push_service.rb` — Push payload processing
- `config/routes.rb` — All route definitions

**Dashboard (`dashboard/`):**
- `src/app/login/page.tsx` — Login page
- `src/app/onboarding/page.tsx` — First-time API key display
- `src/app/settings/page.tsx` — User settings
- `src/app/[slug]/settings/page.tsx` — Org settings
- `src/components/org-switcher.tsx` — Org switcher component
- `src/middleware.ts` — Next.js route protection
- `src/app/layout.tsx` — Add org switcher, user menu
- `src/lib/db.ts` — Add org context to all queries
