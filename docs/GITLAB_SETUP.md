# GitLab Integration Setup

This guide walks through everything needed to get the AX GitLab integration
working end-to-end: creating the OAuth Application on GitLab, configuring
environment variables, and connecting an org from the dashboard.

---

## Overview

The GitLab integration uses an **OAuth Application** registered on gitlab.com.
This is different from the GitHub integration, which uses a GitHub App. GitLab
has no equivalent of GitHub Apps, so the integration relies on:

- **OAuth Application** for user login and API access
- **Per-project webhooks** registered via the GitLab API (not global/system hooks)
- **Automatic token refresh** (GitLab OAuth tokens expire every 2 hours)

One OAuth Application serves two purposes:

1. **User login** — "Sign in with GitLab" on the dashboard (scope: `read_user`)
2. **Org connection** — connecting an org's GitLab projects for webhook delivery
   and MR data ingestion (scope: `read_user api`)

See [ADR-018](decisions/018-gitlab-integration.md) for the full architectural
rationale.

---

## Step 1 — Create a GitLab OAuth Application

1. Go to **https://gitlab.com/admin/applications** (if you're a GitLab admin)
   or **https://gitlab.com/-/user_settings/applications** (for a user-owned app).

   > For production use, a **group-owned** or **instance-level** application is
   > recommended. For development, a user-owned application works fine. Go to
   > **User Settings > Applications** in the GitLab UI.

2. Click **New application** and fill in:

   | Field            | Value                                      |
   | ---------------- | ------------------------------------------ |
   | **Name**         | `AX Metrics` (or whatever you like)        |
   | **Redirect URI** | See below — you need **two** redirect URIs |
   | **Confidential** | Yes (checked)                              |
   | **Scopes**       | `read_user` and `api`                      |

3. **Redirect URIs** — enter both, one per line:

   ```
   https://ax.up.railway.app/users/auth/gitlab/callback
   https://ax.up.railway.app/gitlab/connections/callback
   ```

   Replace `https://ax.up.railway.app` with your `API_BASE_URL` if different.
   - The first URI is the **login callback** — Devise/OmniAuth redirects here
     after "Sign in with GitLab".
   - The second URI is the **connection callback** — used when an org admin
     clicks "Connect GitLab" in the settings page to link their GitLab projects.

   For **local development**, add these as well:

   ```
   http://localhost:3000/users/auth/gitlab/callback
   http://localhost:3000/gitlab/connections/callback
   ```

4. Click **Save application**. GitLab displays the **Application ID** and
   **Secret**. Copy both — you'll need them in the next step.

---

## Step 2 — Set environment variables on the Rails server

Two environment variables are required:

| Variable               | Value                          | Where it's used                                              |
| ---------------------- | ------------------------------ | ------------------------------------------------------------ |
| `GITLAB_CLIENT_ID`     | The Application ID from Step 1 | OAuth consent screen redirect, token exchange, token refresh |
| `GITLAB_CLIENT_SECRET` | The Secret from Step 1         | Token exchange, token refresh                                |

### Production (Railway)

Set them via the Railway dashboard or CLI:

```bash
railway variables set GITLAB_CLIENT_ID=<your-application-id>
railway variables set GITLAB_CLIENT_SECRET=<your-secret>
```

### Local development

Add them to your shell environment or a `.env` file that your local Rails
process reads:

```bash
export GITLAB_CLIENT_ID=<your-application-id>
export GITLAB_CLIENT_SECRET=<your-secret>
```

### Pre-existing variables that GitLab also depends on

These are not GitLab-specific, but the GitLab integration uses them. They
should already be set if your Rails server is running:

| Variable        | Default                     | Purpose                                                                                                                        |
| --------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `API_BASE_URL`  | `https://ax.up.railway.app` | Used to construct the OAuth redirect URI and webhook delivery URL. Must match what you entered in GitLab's redirect URI field. |
| `DASHBOARD_URL` | `http://localhost:3333`     | Where the server redirects after a successful GitLab connection (e.g., `https://www.axmetrics.dev`).                           |

### How to verify

If `GITLAB_CLIENT_ID` is not set, clicking "Connect GitLab" in the dashboard
returns a `503 Service Unavailable` with the message "GitLab integration not
configured." If you see this, the env var is missing or empty.

---

## Step 3 — Verify the database is up to date

The GitLab integration requires several database migrations. If you're on the
`gitlab-support` branch (or later), these should already be applied. Run
migrations to make sure:

```bash
just server-db-migrate
```

The relevant migrations (in order):

| Migration                                       | What it does                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `20260425000002_add_gitlab_identity_to_users`   | Adds `gitlab_id` and `gitlab_username` columns to `users`                                           |
| `20260425000003_create_gitlab_connections`      | Creates the `gitlab_connections` table (stores OAuth tokens, webhook secret, connection status)     |
| `20260425000004_create_processed_gitlab_events` | Creates `processed_gitlab_events` for webhook idempotency (deduplication via `X-Gitlab-Event-UUID`) |
| `20260425000005_add_gitlab_username_to_invites` | Adds `gitlab_username` column to `invites`                                                          |
| `20260425000007_add_gitlab_fields_to_repos`     | Adds `gitlab_project_id` and `gitlab_webhook_id` columns to `repos`                                 |

---

## Step 4 — Connect GitLab from the dashboard

Once the server is configured, connecting GitLab is done entirely from the
dashboard UI — no manual webhook registration or API calls needed.

1. Sign in to the dashboard (with GitHub or GitLab — either works).
2. Navigate to **`/{your-org-slug}/settings`**.
3. Find the **GitLab Integration** card.
4. Click **Connect GitLab** (you must be an org admin or owner).
5. You're redirected to GitLab's OAuth consent screen. Authorize AX with the
   requested scopes (`read_user` and `api`).
6. GitLab redirects back to the server's callback
   (`/gitlab/connections/callback`). The server:
   - Exchanges the authorization code for access + refresh tokens
   - Fetches the GitLab user profile
   - Creates (or updates) a `GitlabConnection` record for the org
   - Kicks off a background backfill job
7. You're redirected back to `/{slug}/settings?gitlab_connected=true` with a
   success banner.

### What the backfill job does

The `GitlabApp::BackfillConnectionJob` runs automatically after connection:

1. Lists all GitLab projects accessible to the authenticated user
2. Creates or updates `Repo` records for each project (with `platform: "gitlab"`)
3. Registers a **per-project webhook** on each project via the GitLab API,
   subscribing to `merge_requests_events` and `pipeline_events`
4. Fetches the last **90 days** of merge request history for each project
5. Processes each MR through the standard webhook handlers (open, update,
   merge, close) to seed metrics

This can take several minutes for accounts with many projects. The "Last
synced" timestamp in the settings card updates when it completes.

---

## Step 5 — Verify it's working

### Check the settings card

On `/{slug}/settings`, the GitLab Integration card should show:

- **Status**: Connected (green badge)
- **Account**: The GitLab username used for the connection
- **Repositories**: Number of connected projects
- **Last synced**: Timestamp (or "Syncing..." if the backfill is still running)

### Check webhook delivery

1. Open any connected GitLab project in the GitLab UI.
2. Go to **Settings > Webhooks**.
3. You should see a webhook pointing to `{API_BASE_URL}/webhooks/gitlab` with
   merge request and pipeline events enabled.
4. Click **Test** > **Merge request events** to send a test payload.
5. Check the Rails server logs for `[webhook] gitlab` entries.

### Check MR data

After the backfill completes, navigate to `/{slug}/prs` on the dashboard. You
should see merge requests from your GitLab projects alongside any GitHub PRs.

---

## GitLab Login (Sign in with GitLab)

GitLab login is separate from the org connection. It uses the **same OAuth
Application** but with a different callback path and a narrower effective scope
(`read_user` for profile info only).

Once `GITLAB_CLIENT_ID` and `GITLAB_CLIENT_SECRET` are set, the "Sign in with
GitLab" button on the login page works automatically. The flow:

1. User clicks "Sign in with GitLab" on the dashboard login page
2. Dashboard links to `{API_BASE_URL}/users/auth/gitlab`
3. Rails/Devise redirects to GitLab's OAuth consent screen
4. User approves, GitLab redirects to `{API_BASE_URL}/users/auth/gitlab/callback`
5. Rails creates or updates the user record (matching by email if they already
   have a GitHub account)
6. Rails redirects to the dashboard with a session token

> If a user signs in with GitLab using the same email as an existing GitHub
> account, the two identities are automatically linked — they become one user
> with both `github_id` and `gitlab_id` set.

---

## CLI support

The `ax push` command works transparently with GitLab repos. The CLI detects
the platform from the git remote URL:

- If the remote hostname contains `gitlab.com`, the payload includes
  `platform: "gitlab"`
- The server matches the repo by its platform and path

No additional CLI configuration is needed for GitLab repos.

---

## Disconnecting

An org admin can disconnect GitLab from `/{slug}/settings` by clicking
**Disconnect** on the GitLab Integration card. This:

1. Sets the connection status to `"revoked"`
2. Unlinks all repos from the connection (clears `gitlab_connection_id`)
3. **Does not** delete historical data or computed metrics
4. **Does not** automatically remove the per-project webhooks from GitLab
   (they'll fail silently since the server will reject events from a revoked
   connection)

To fully clean up webhooks on GitLab's side, remove them manually from each
project's **Settings > Webhooks** page, or re-connect and disconnect which
will trigger cleanup.

---

## Troubleshooting

### "GitLab integration not configured" (503)

The `GITLAB_CLIENT_ID` environment variable is not set on the Rails server.
Set it and restart.

### OAuth consent screen shows wrong scopes

The scopes are configured in `server/config/initializers/devise.rb` (for login)
and in the `connect_url` action (for org connection). Both request
`read_user api`. Make sure your GitLab OAuth Application has both `read_user`
and `api` scopes enabled.

### "Token exchange failed" after authorizing

The redirect URI in your GitLab OAuth Application doesn't match what the server
sends. Compare:

- **GitLab app setting**: the redirect URIs you entered in Step 1
- **Server callback URL**: `{API_BASE_URL}/gitlab/connections/callback`

These must match exactly, including protocol (`https` vs `http`) and trailing
slashes.

### Webhooks aren't being delivered

1. Check that the backfill job completed (look for "Last synced" timestamp in
   the settings card).
2. Check the webhook exists on the GitLab project (**Settings > Webhooks**).
3. Check the webhook URL points to your production server, not localhost.
4. Check GitLab's webhook delivery logs for HTTP errors (click the webhook in
   GitLab, then **Recent events**).

### Token expired / connection shows "expired"

GitLab OAuth tokens expire every 2 hours. The server automatically refreshes
them before each API call. If the refresh token itself becomes invalid (e.g.,
the user revoked the OAuth Application), the connection status is set to
`"expired"`. The fix is to disconnect and re-connect GitLab from the settings
page.

### MRs not showing up after backfill

- The backfill only fetches MRs from the last 90 days.
- Only MRs in merged or closed state get full metrics computed (same as GitHub
  PRs — see [ADR-010](decisions/010-github-event-ingestion.md)).
- Open MRs appear in the PR list but won't have aggregate metrics.

---

## Environment variable summary

| Variable               | Required    | Where              | Purpose                                                                         |
| ---------------------- | ----------- | ------------------ | ------------------------------------------------------------------------------- |
| `GITLAB_CLIENT_ID`     | Yes         | Rails server       | GitLab OAuth Application ID                                                     |
| `GITLAB_CLIENT_SECRET` | Yes         | Rails server       | GitLab OAuth Application Secret                                                 |
| `API_BASE_URL`         | Already set | Rails server       | Base URL for callbacks and webhook delivery (e.g., `https://ax.up.railway.app`) |
| `DASHBOARD_URL`        | Already set | Rails server       | Dashboard URL for post-auth redirects (e.g., `https://www.axmetrics.dev`)       |
| `AX_API_URL`           | Already set | Dashboard (Vercel) | Points the dashboard at the Rails API (e.g., `https://ax.up.railway.app`)       |

Only `GITLAB_CLIENT_ID` and `GITLAB_CLIENT_SECRET` are new. The others should
already be configured from the GitHub integration setup.

---

## Quick checklist

- [ ] GitLab OAuth Application created with `read_user` + `api` scopes
- [ ] Application marked as **Confidential**
- [ ] Both redirect URIs added (login callback + connection callback)
- [ ] `GITLAB_CLIENT_ID` set on Rails server
- [ ] `GITLAB_CLIENT_SECRET` set on Rails server
- [ ] `API_BASE_URL` matches the redirect URIs in the GitLab app
- [ ] Database migrations applied
- [ ] Server restarted / redeployed with new env vars
- [ ] "Sign in with GitLab" works on the login page
- [ ] "Connect GitLab" works from org settings (admin only)
- [ ] Backfill completes and MRs appear in the dashboard
- [ ] Test webhook delivery from a GitLab project
