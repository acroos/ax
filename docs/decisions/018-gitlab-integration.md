# ADR-018: GitLab Integration Model

## Status
Accepted

## Date
2026-04-25

## Context
AX previously supported GitHub exclusively for VCS integration (OAuth login, webhook-driven PR ingestion, metric computation). Users want identical functionality with GitLab. The integration needs to support the same features: OAuth login, automatic PR (MR) data ingestion via webhooks, historical backfill, and metric computation.

GitLab's platform model differs from GitHub's. GitHub has a first-class "App" concept that bundles OAuth, webhooks, and repo access into one installation. GitLab has no equivalent — instead it provides separate OAuth Applications, per-project webhooks via API, and token-scoped access.

## Decision

### OAuth Application (not App-level webhooks)

GitLab integration uses an OAuth Application with `api` scope. The `api` scope is required because GitLab's finer-grained scopes (`read_api`, `read_repository`) don't cover webhook management or MR file diffs. Unlike GitHub Apps, GitLab OAuth tokens have a 2-hour expiry with refresh tokens, so the server implements automatic token refresh before each API call.

### Per-project webhooks (not global)

GitLab webhooks are registered per-project via the GitLab API, subscribing to `merge_request_events` and `pipeline_events`. Each project webhook uses the org's shared `webhook_secret` for validation via the `X-Gitlab-Token` header (simple string comparison, unlike GitHub's HMAC-SHA256).

### One connection per org

Mirrors the GitHub model: each org can have one GitLab connection (like one GitHub App installation). The connection stores encrypted OAuth tokens and is used to manage webhooks and fetch data for all connected projects.

### Platform-agnostic data model

Rather than duplicating tables, the existing data model was extended:
- `repos` table has `platform` column ("github" | "gitlab") and `gitlab_connection_id` FK
- `users` table has both `github_id`/`github_username` and `gitlab_id`/`gitlab_username` (both nullable, at least one required)
- `invites` table has `platform` column for platform-specific username matching
- PR terminology is preserved everywhere — "PR" in the data model and UI, even for GitLab merge requests

### Parallel webhook handler structure

GitLab webhook handlers (`WebhookHandlers::Gitlab::*`) mirror the GitHub handlers (`WebhookHandlers::*`) but translate GitLab-specific payload shapes:
- MR `iid` maps to PR `number`
- `source_branch` maps to `branch`
- MR actions (open/update/merge/close) map to the same lifecycle as GitHub PRs
- Pipeline status maps to CI pass/fail

The backfill job (`BackfillGitlabRepoJob`) reuses the webhook handlers via the same `Backfillable` pattern as `BackfillRepoJob`.

### gitlab.com only (for now)

This integration targets gitlab.com exclusively. Self-hosted GitLab support can be added later by parameterizing the instance URL in `GitlabConnection` and `GitlabApp::Client`.

## Alternatives Considered

### GitLab system hooks
System hooks require GitLab admin access (unavailable on gitlab.com for most users). Per-project webhooks work with regular project access via the `api` scope.

### Separate MR data model
Considered having a separate `merge_requests` table instead of reusing `prs`. Rejected because metrics, aggregation, correlation, and display logic would all need duplication. Using "PR" as a generic term with a `platform` field on repos is simpler and maintains a single code path for metric computation.

### Email-based invites instead of platform username
Considered switching invites to email-only (platform-agnostic). Kept platform-specific usernames because they're verifiable at accept time (the user's OAuth identity confirms the username) and some orgs prefer username-based access control.

## Consequences

### Easier
- Users can get GitLab metrics alongside GitHub metrics in the same dashboard
- Multi-platform orgs can connect both simultaneously
- CLI `ax push` works transparently for GitLab repos (platform detected from git remote)
- Adding more platforms in the future follows the same pattern

### Harder
- Two sets of webhook handlers to maintain (though they share the same base logic)
- Token refresh adds complexity vs GitHub's long-lived installation tokens
- Per-project webhooks require cleanup on disconnect (vs GitHub App-level uninstall)
- Platform-conditional logic in a few places (login page, settings, invites, onboarding)
