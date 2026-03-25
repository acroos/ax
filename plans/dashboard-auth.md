## Dashboard Authentication Plan

### Current State

The AX dashboard is a Next.js app (`dashboard/`) that reads directly from the local SQLite database via `better-sqlite3`. There is no Go HTTP server yet -- `ax dashboard` simply launches `npx next dev`. ADR-007 describes the target architecture where the Go binary serves a static export and API endpoints, but this is not yet built. There is no `ax server` command, no REST API layer, and no authentication of any kind.

This plan assumes a Go HTTP server (`ax server`) will exist or be built as a prerequisite. The auth system is designed to live in that server.

### Architecture Overview

```
Browser                     Go Server (ax server)              GitHub API
  │                              │                                │
  │  GET /auth/github            │                                │
  │─────────────────────────────>│                                │
  │  302 → github.com/login/...  │                                │
  │<─────────────────────────────│                                │
  │                              │                                │
  │  GET /auth/callback?code=... │                                │
  │─────────────────────────────>│  POST /login/oauth/access_token│
  │                              │───────────────────────────────>│
  │                              │  { access_token }              │
  │                              │<───────────────────────────────│
  │                              │  GET /user, /user/orgs         │
  │                              │───────────────────────────────>│
  │                              │  { login, orgs }               │
  │                              │<───────────────────────────────│
  │  Set-Cookie: ax_session=...  │                                │
  │<─────────────────────────────│                                │
  │  302 → /                     │                                │
  │                              │                                │
  │  GET /api/metrics            │                                │
  │  Cookie: ax_session=...      │                                │
  │─────────────────────────────>│  validate session              │
  │  200 { data }                │                                │
  │<─────────────────────────────│                                │
```

### 1. Session Storage: Database-Backed Sessions with Signed Cookies

**Decision: Server-side sessions stored in SQLite, referenced by a signed opaque token in a cookie.**

Rationale for sessions over pure JWTs:
- Sessions can be revoked instantly (logout, org removal)
- No token size bloat in cookies
- Aligns with the existing SQLite-centric architecture
- JWTs would require a refresh/rotation mechanism for the configurable expiry requirement

The cookie value is an opaque session ID (a cryptographically random 32-byte hex string), signed with HMAC-SHA256 using a server-side secret. This prevents session ID forgery without requiring a full JWT library.

**New migration (version 4) in `internal/db/db.go`:**

```sql
CREATE TABLE auth_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER NOT NULL UNIQUE,
    github_login TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,              -- opaque random token
    user_id INTEGER NOT NULL REFERENCES auth_users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expires ON auth_sessions(expires_at);
```

### 2. Go Server Auth Configuration

Auth configuration lives in the server config (environment variables and/or a config file at `~/.ax/server.yaml`). Auth is entirely optional -- when `AX_AUTH_ENABLED=false` (the default), all endpoints are open.

```yaml
# ~/.ax/server.yaml
auth:
  enabled: true
  session_expiry: "168h"          # 7 days, configurable
  session_secret: "..."           # Auto-generated on first run if missing

  github:
    client_id: "..."
    client_secret: "..."
    allowed_orgs: ["my-company"]  # Empty = any GitHub user
    allowed_teams: []             # Optional: org/team-slug pairs
    # Future: scopes beyond default (read:org is always requested)

  # Future SSO extension point
  # oidc:
  #   issuer: "https://accounts.google.com"
  #   client_id: "..."
  #   client_secret: "..."
  #   allowed_groups: []
```

**Key design choices:**
- `session_secret` is generated automatically on first `ax server` start if not set, and written to the config file. This avoids requiring manual secret management for simple deployments.
- `allowed_orgs` is the primary access control mechanism. If empty, any authenticated GitHub user can access the dashboard.
- `allowed_teams` is optional and additive -- if set, the user must be a member of at least one listed team within an allowed org.

### 3. Go Server Auth Endpoints

New package: `internal/server/auth/`

#### `GET /auth/github`
- Generates a random `state` parameter, stores it in a short-lived entry (or signed cookie)
- Redirects to `https://github.com/login/oauth/authorize` with:
  - `client_id`, `redirect_uri=/auth/callback`, `state`
  - `scope=read:org` (needed for org/team membership checks)

#### `GET /auth/callback`
- Validates `state` parameter against the stored value
- Exchanges `code` for an access token via `POST https://github.com/login/oauth/access_token`
- Fetches user info: `GET https://api.github.com/user`
- Fetches org memberships: `GET https://api.github.com/user/orgs`
- If `allowed_orgs` is configured, verifies the user belongs to at least one
- If `allowed_teams` is configured, checks team membership via `GET https://api.github.com/orgs/{org}/teams/{team}/members/{username}`
- Creates or updates the `auth_users` row
- Creates an `auth_sessions` row with expiry based on config
- Sets `ax_session` cookie (HttpOnly, Secure in production, SameSite=Lax)
- Redirects to `/` (or to a `redirect_to` query param if provided)

#### `GET /auth/me`
- Reads the `ax_session` cookie, looks up the session, returns user info
- Response: `{ id, github_login, display_name, avatar_url, orgs: [...] }`
- Returns 401 if no valid session

#### `POST /auth/logout`
- Deletes the session row from the database
- Clears the `ax_session` cookie
- Returns 200

### 4. Auth Middleware in Go Server

New file: `internal/server/middleware/auth.go`

```go
func RequireAuth(config AuthConfig, db *sqlx.DB) func(http.Handler) http.Handler
```

This middleware:
1. Checks if auth is enabled in config. If disabled, passes through.
2. Extracts the `ax_session` cookie.
3. Validates the HMAC signature on the session ID.
4. Looks up the session in the database, checks `expires_at > now()`.
5. If valid, adds the user to the request context (`context.WithValue`).
6. If invalid/missing, returns 401.

Special cases:
- The push API (`/api/push`) uses API key auth (existing mechanism), not session auth. The middleware skips it.
- The auth endpoints (`/auth/*`) are excluded from the middleware.
- Health check (`/healthz`) is excluded.

### 5. Next.js Integration

The dashboard needs two changes: a login page and route protection middleware.

#### 5a. Next.js Middleware (`dashboard/src/middleware.ts`)

```typescript
// Protects all routes except /login
// Checks for ax_session cookie presence
// For server-side validation, the Go server handles it --
// the middleware only does a fast client-side cookie check
// and redirects to /login if missing
```

The middleware checks for the `ax_session` cookie. If absent, it redirects to `/login`. It does NOT validate the session server-side (that happens when the page fetches data from the Go API). This keeps the middleware fast and avoids a round-trip on every navigation.

Configuration: The middleware reads `AX_AUTH_ENABLED` from the environment. If `false`, the middleware passes through all requests.

#### 5b. Login Page (`dashboard/src/app/login/page.tsx`)

A minimal, dark-mode login page with a single "Login with GitHub" button that links to the Go server's `/auth/github` endpoint. Follows the Linear-inspired UX philosophy from ADR-006: clean, minimal, no unnecessary chrome.

#### 5c. Dashboard Data Fetching Changes

Currently, `dashboard/src/lib/db.ts` reads directly from SQLite via `better-sqlite3`. For team deployments with auth, the dashboard needs to fetch data from the Go server's REST API instead.

This is a larger change that aligns with ADR-007 (the Go binary serves API endpoints). The approach:

- Add `dashboard/src/lib/api.ts` that fetches from the Go server's REST endpoints
- The `db.ts` module continues to work for local/dev mode (direct SQLite access)
- A config flag (`AX_API_URL` env var) determines which mode is used
- When fetching from the API, the `ax_session` cookie is forwarded automatically (same-origin)

#### 5d. User Menu in Sidebar

Add a user avatar and name at the bottom of the sidebar (in `layout.tsx`), with a dropdown containing "Logout". The avatar URL comes from `/auth/me`.

### 6. GitHub Org/Team Restriction

The org/team check happens at login time (`/auth/callback`), not on every request. This means:

- If a user is removed from an org, they retain access until their session expires
- This is acceptable for the v1 scope. A future enhancement could re-check org membership periodically (e.g., on session refresh)

The check flow:
1. Fetch `GET https://api.github.com/user/orgs` with the user's OAuth token
2. Extract org logins, compare against `allowed_orgs` config
3. If `allowed_teams` is also set, additionally call `GET https://api.github.com/orgs/{org}/teams/{team_slug}/memberships/{username}` for each configured team
4. If the user is not in any allowed org (or team, if configured), return a 403 page explaining they lack access

### 7. Future SSO Extension Points

The auth system is designed with a provider abstraction:

```go
// internal/server/auth/provider.go
type AuthProvider interface {
    // Name returns the provider identifier (e.g., "github", "oidc")
    Name() string
    // AuthURL returns the URL to redirect the user to for authentication
    AuthURL(state string) string
    // ExchangeCode exchanges an auth code for user information
    ExchangeCode(ctx context.Context, code string) (*AuthUser, error)
    // CheckAccess verifies the user is allowed (org/group membership)
    CheckAccess(ctx context.Context, user *AuthUser) error
}

type AuthUser struct {
    ProviderID   string
    ProviderName string
    Login        string
    DisplayName  string
    AvatarURL    string
    Email        string
    Groups       []string  // orgs for GitHub, groups for OIDC
}
```

Adding SAML/OIDC later means:
1. Implement a new `AuthProvider` (e.g., `OIDCProvider`)
2. Add config section for OIDC (`issuer`, `client_id`, `client_secret`, `allowed_groups`)
3. Register the provider in the auth router
4. The session management, middleware, and cookie handling remain unchanged

### 8. Implementation Phases

#### Phase A: Go Server Foundation (prerequisite)
Before auth can be built, the Go server needs to exist. This phase creates `ax server` with basic API endpoints that the dashboard can call. If this already exists when auth work begins, skip to Phase B.

Files to create:
- `internal/server/server.go` -- HTTP server setup, router, port config
- `internal/server/handlers/` -- API handlers for metrics, PRs, repos
- `cmd/ax/main.go` -- add `newServerCmd()`

#### Phase B: Auth Core (Go server)
Build the authentication system in the Go server.

1. Add migration v4 with `auth_users` and `auth_sessions` tables (`internal/db/db.go`)
2. Add models (`internal/db/models.go`): `AuthUser`, `AuthSession`
3. Add queries (`internal/db/queries.go`): `CreateAuthUser`, `GetAuthUser`, `CreateSession`, `GetSession`, `DeleteSession`, `CleanExpiredSessions`
4. Create `internal/server/auth/provider.go` -- `AuthProvider` interface
5. Create `internal/server/auth/github.go` -- GitHub OAuth provider
6. Create `internal/server/auth/handlers.go` -- `/auth/github`, `/auth/callback`, `/auth/me`, `/auth/logout` handlers
7. Create `internal/server/middleware/auth.go` -- session validation middleware
8. Add `internal/server/config.go` -- auth config struct, loading from env/file
9. Wire auth middleware and routes into `internal/server/server.go`

#### Phase C: Dashboard Integration
Connect the Next.js dashboard to the auth system.

1. Create `dashboard/src/middleware.ts` -- route protection
2. Create `dashboard/src/app/login/page.tsx` -- login page
3. Create `dashboard/src/lib/api.ts` -- API client for Go server
4. Update `dashboard/src/app/layout.tsx` -- user menu in sidebar
5. Update data-fetching functions to support API mode

#### Phase D: Documentation and Config
1. Write ADR-010 for dashboard authentication
2. Add auth setup docs to README
3. Add auth config to Docker Compose and Helm chart examples

### 9. Docker Compose and Helm Considerations

For containerized deployments:

**Docker Compose:**
- The `ax-server` container needs `AX_AUTH_ENABLED=true`, `AX_GITHUB_CLIENT_ID`, `AX_GITHUB_CLIENT_SECRET`, `AX_AUTH_ALLOWED_ORGS`
- The `ax_session` cookie domain must match the deployment domain
- Session secret should be mounted as a Docker secret or environment variable

**Helm:**
- Auth config goes in the `values.yaml` under an `auth:` section
- GitHub OAuth credentials should be a Kubernetes secret, referenced in the deployment
- The session secret should also be a Kubernetes secret, auto-generated by a Job if not provided

### 10. Security Considerations

- **CSRF protection**: The OAuth `state` parameter prevents CSRF on the login flow. For logout and other POST endpoints, include a CSRF token (can be derived from the session).
- **Cookie flags**: `HttpOnly`, `Secure` (when not localhost), `SameSite=Lax`, `Path=/`
- **Session secret rotation**: Support for multiple valid secrets (current + previous) to allow rotation without invalidating all sessions
- **Rate limiting**: Rate-limit `/auth/github` and `/auth/callback` to prevent abuse
- **Token storage**: GitHub OAuth tokens are NOT stored long-term. They are used only during the callback to fetch user info and check org membership, then discarded. If future features need GitHub API access (e.g., periodic org re-checks), the token would need to be stored encrypted.

### Critical Files for Implementation

- `/Users/austinroos/dev/ax/internal/db/db.go` - Add migration v4 for auth_users and auth_sessions tables
- `/Users/austinroos/dev/ax/internal/server/auth/github.go` - Core GitHub OAuth provider implementation (new file)
- `/Users/austinroos/dev/ax/internal/server/middleware/auth.go` - Session validation middleware for all API routes (new file)
- `/Users/austinroos/dev/ax/dashboard/src/middleware.ts` - Next.js route protection, cookie check and redirect to /login (new file)
- `/Users/austinroos/dev/ax/dashboard/src/app/layout.tsx` - Add user menu to sidebar, conditionally show login state
