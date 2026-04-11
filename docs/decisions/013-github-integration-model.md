# ADR-013: GitHub Integration Model (OAuth App + GitHub App)

## Status
Accepted

## Date
2026-04-10

## Context

The AX managed service needs three things from GitHub:

1. **User identity** — sign in with GitHub to create user accounts and sessions.
2. **Repository data access** — read PRs, reviews, commits, and CI status for repos that belong to a customer org.
3. **Webhook delivery** — real-time PR and CI events flowing into the Rails server without manual per-repo configuration.

GitHub offers two integration primitives that can provide these capabilities, and they behave very differently:

- **OAuth Apps** use `client_id` / `client_secret`, request OAuth scopes, and produce user-scoped tokens. Every API call is made "as the user." Webhooks are not automatic — they must be created per-repository via the API (requiring the `admin:repo_hook` scope) or added manually in each repo's settings.
- **GitHub Apps** are installed by org admins on one or more repositories. Once installed, webhooks for all configured events flow automatically to a single URL with no per-repo setup. API calls use installation tokens (server-to-server) with per-installation rate limits. GitHub Apps also support a "Sign in with GitHub" user-to-server OAuth flow, but that flow has permission and tooling quirks — most notably, `omniauth-github` does not play cleanly with GitHub App tokens because endpoints like `GET /user/emails` return `"Resource not accessible by integration"` unless a specific Account permission is granted and the user re-authorizes.

Our initial attempt used a single GitHub App for everything. Login broke at the `/user/emails` step because the GitHub App token did not have the Email permission, and even with that fixed, `omniauth-github`'s assumptions about OAuth App scopes would require ongoing patching.

We need a model that:

- Makes webhook delivery automatic and org-wide (no per-repo admin setup).
- Uses off-the-shelf libraries for login instead of custom auth code.
- Scales rate limits with the number of customer installations, not with the number of individual users.
- Survives individual user departures without breaking data ingestion for their org.

## Decision

Use **two separate GitHub integrations** in the managed service:

### 1. OAuth App — for login only

- Minimal scopes: `read:user`, `user:email`.
- Used by `omniauth-github` + Devise for the sign-in flow at `/users/auth/github`.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` env vars point at this app.
- Never used for repo data access. Its only job is identity.

### 2. GitHub App — for repo access and webhook delivery

- Installed by an org admin on their GitHub organization (one-click, covers all current and future repos in the installation).
- Permissions:
  - Repository: `Contents: Read`, `Pull requests: Read`, `Checks: Read`, `Metadata: Read`
  - Subscribed events: `pull_request`, `pull_request_review`, `check_suite`, `push`, `installation`, `installation_repositories`
- Webhook URL points at `POST /webhooks/github` on the Rails server.
- Env vars: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`.
- All repo API calls go through installation tokens minted from the app's private key (JWT → exchange for installation token, cached per installation).

### Linking the two

- User signs in via the OAuth App → `User` record is created or looked up by GitHub ID.
- Org admin goes to `/{slug}/settings` in the dashboard and clicks "Install GitHub App" → redirected to the GitHub App's install URL with a `state` parameter encoding the org slug.
- GitHub redirects back after install; the Rails server either receives the `installation` webhook or a callback with the `installation_id` and persists a new `GithubInstallation` record associated with the org.
- From then on, all repo sync, PR fetching, and webhook handling for that org uses the installation, not the user's OAuth token.

### What the OAuth token is **not** used for

- Reading any repo data. Ever.
- Creating webhooks (the GitHub App handles all webhook delivery).
- Any long-lived background job. OAuth tokens are used only during the login request itself and are not persisted.

## Alternatives Considered

### OAuth App only

Use a single OAuth App for both login and repo access. Create webhooks per-repo via API calls using the user's token with `admin:repo_hook`.

Rejected because:
- `admin:repo_hook` is a broad, scary scope on the consent screen.
- Webhooks must be created per-repo via API calls — no "install once on an org" path.
- Rate limits are per-user (5,000/hr), which pinches at scale.
- Data ingestion is tied to whichever user's token created the webhook; user leaving can orphan data flows.
- Does not meet our stated requirement that org admins should not have to configure webhooks repo-by-repo.

### GitHub App only

Use a single GitHub App for everything, including login via its user-to-server OAuth flow.

Rejected because:
- `omniauth-github` is written for OAuth Apps. GitHub App user tokens hit a `403 "Resource not accessible by integration"` on `/user/emails` unless the "Email addresses: Read" Account permission is granted *and* users re-authorize.
- Even with that permission fix, `omniauth-github` inspects OAuth scopes in the token response, and GitHub Apps report scopes differently, leading to subtle behavioral differences and potential future breakage.
- We would be carrying patches or a custom strategy against a library we otherwise get for free.
- The "one app" elegance does not outweigh the ongoing maintenance cost against the login library.

### Fine-grained personal access tokens

Require users to generate and paste PATs for each repo.

Rejected because:
- Terrible UX for a managed service.
- PATs expire and require manual rotation.
- No automatic webhook delivery.

## Consequences

### Easier

- Login works with stock `omniauth-github` and Devise — no patches, no custom strategies.
- Org admins get one-click "Install AX on my org" with no per-repo setup. New repos added to the org after installation are automatically covered.
- Webhook delivery is automatic and configured once per installation.
- API rate limits scale per installation, not per user.
- Data ingestion for an org survives individual users leaving, because repo access runs through the installation, not a user token.
- The OAuth App consent screen is lightweight (`read:user`, `user:email`) — signup feels fast.
- Each GitHub integration does one thing, which is easier to debug when something breaks.

### More difficult

- Two GitHub integrations to create, document, and keep credentials synced across environments (local, staging, production).
- Two env var sets in deployment (`GITHUB_CLIENT_ID/SECRET` for the OAuth App; `GITHUB_APP_ID/PRIVATE_KEY/WEBHOOK_SECRET` for the GitHub App).
- Onboarding has two distinct steps: log in (personal) and install the GitHub App on the org (admin action). These are deliberately separated, but the second step must be clearly surfaced in the dashboard for first-time orgs.
- Need to implement the installation lifecycle: install callback handling, `GithubInstallation` model, installation token minting with JWT signing, and the handler for the `installation` / `installation_repositories` webhook events. None of this exists yet.
- `docs/team-setup.md` needs a section explaining the two-step setup to self-service customers.

### Scope for follow-up work

This ADR captures the architectural decision. Implementation is staged:

1. **Immediate** (unblocks login): create the OAuth App, point env vars at it, verify sign-in works end-to-end.
2. **Next** (separate PR): add `GithubInstallation` model, install-flow controller, installation webhook handler, and installation token client.
3. **Then**: migrate existing repo sync code paths to use installation tokens instead of the placeholder user-token path.
4. **Finally**: update `docs/team-setup.md` and the onboarding page in the dashboard to walk admins through both steps.
