# Authentication

AX has three authentication mechanisms, each serving a different component and use case.

## Local Mode: No Auth

In local mode, there is no authentication. The CLI writes to `~/.ax/ax.db` and the dashboard reads from it. Both run on the same machine as the user.

## CLI → Rails API: API Key

The CLI authenticates with the Rails server using an API key.

**Format**: `ax_k1_` prefix + 64 hex characters (32 random bytes)

**Storage**:
- Client-side: `~/.ax/config.json` (plaintext)
- Server-side: `api_keys` table (`key_hash` column, bcrypt)

**Usage**:
```
Authorization: Bearer ax_k1_<hex>
```

**Lifecycle**:
1. Generated automatically when a user first signs in via GitHub OAuth
2. Displayed during onboarding so the user can copy it
3. Used in `ax init --team <url> --api-key <key>` to configure the CLI
4. Can be rotated via `POST /api/v1/api_key/rotate` (revokes old, generates new)
5. `last_used_at` updated on each authenticated request

**Validation** (`ApiKey.authenticate`):
1. Check prefix matches `ax_k1_`
2. Load all non-revoked keys (there's one per user)
3. bcrypt compare against each `key_hash`
4. Return the associated user

**Used by**: `POST /api/v1/push`, `GET /api/v1/watch-status`

## Dashboard → Rails API: Session Token

The dashboard authenticates with the Rails server using session tokens passed in a custom header.

**Format**: `SecureRandom.hex(32)` — 64 hex characters

**Storage**:
- Client-side: `_ax_session` HttpOnly cookie
- Server-side: `user_sessions` table

**Usage**:
```
X-Ax-Session: <token>
```

**Lifecycle**:
1. Created during GitHub OAuth callback
2. Set as a cookie via the `/auth/accept` cross-origin handoff
3. Expires after 30 days
4. Destroyed on `POST /auth/logout`

**Used by**: All dashboard API calls (org reads, member management, settings)

## GitHub OAuth Flow

The OAuth flow connects the dashboard user to their GitHub identity.

```
1. User clicks "Sign in with GitHub" on dashboard
2. Dashboard redirects to Rails: GET /users/auth/github
3. Rails redirects to GitHub OAuth consent screen
4. User approves → GitHub redirects to Rails callback
5. Rails creates/updates User record via AuthService
6. Rails creates UserSession with 30-day expiry
7. Rails redirects to: DASHBOARD_URL/auth/accept?token=<session_token>&next=<path>
8. Dashboard /auth/accept route sets _ax_session cookie
9. Dashboard redirects to intended page
```

### Cross-Origin Handoff

The Rails server and dashboard run on different origins (e.g., `app.ax.dev` and `dashboard.ax.dev`). The server cannot set cookies on the dashboard's domain directly.

Current approach (stopgap): the session token is passed via URL query parameter in step 7. The `/auth/accept` route on the dashboard reads the token, sets it as an HttpOnly cookie, and redirects — so the token does not persist in browser history.

Future plan: shared parent domain cookies (e.g., both on `*.ax.dev`).

### First Login Side Effects

When a user signs in for the first time:
1. A `User` record is created from their GitHub profile
2. A personal `Organization` is created (is_personal = true)
3. An `ApiKey` is generated
4. Any pending `Invite` records matching their GitHub username are auto-accepted

## Authorization

### Org Membership
All data access in managed mode is scoped to organizations. The user must be a member of the org to access its data.

### Roles
| Role | Can read data | Can manage members/invites | Can delete org |
|------|--------------|---------------------------|----------------|
| member | Yes | No | No |
| admin | Yes | Yes | No |
| owner | Yes | Yes | Yes |

### Enforcement
- `find_org!` — Loads org by slug, returns 403 if user is not a member
- `find_org_as_admin!` — Same, but requires admin or owner role
- Implemented in `Api::V1::BaseController`

## Middleware (Dashboard)

`dashboard/src/middleware.ts` enforces authentication on the dashboard side:

- Only active when `AX_API_URL` is set (managed mode)
- Checks for `_ax_session` cookie
- Redirects unauthenticated users to `/login?redirect=<original_path>`
- Public paths exempt: `/login`, `/invite`, `/auth`, `/docs`, `/_next`, `/favicon`
