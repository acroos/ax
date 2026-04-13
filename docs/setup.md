# AX Setup

Connect the `ax` CLI to the AX managed service so your PR metrics,
Claude Code session data, and cost figures flow into a shared dashboard.

---

## Prerequisites

- **`ax` CLI.** Install via the Homebrew tap:

  ```bash
  brew install acroos/tap/ax
  ```

  This is the only supported distribution channel (see
  [ADR-008](decisions/008-distribution-strategy.md)). You can also build from
  source with `make build` if you're contributing.

- **A GitHub account.** Sign-in is GitHub OAuth. There is no email/password
  flow.

- **Claude Code.** The `ax` CLI reads session data from `~/.claude/projects/`
  and installs hooks into `~/.claude/settings.json`. If you're not using
  Claude Code, session metrics will be empty but GitHub-sourced metrics still
  work.

---

## Step 1 — Sign in to the dashboard

Open `https://ax-metrics.vercel.app` and click **Sign in with GitHub**.
You'll be bounced through GitHub's OAuth consent screen (scopes: `read:user`
and `user:email`), then back to the dashboard.

On first sign-in:

- A `User` record is created from your GitHub profile.
- A **personal organization** is created automatically, slugged from your
  GitHub username. You land on the onboarding page.
- An **API key** is minted for your user account. You'll use it in Step 3.

The OAuth App used for login is separate from the GitHub App that handles
repo data and webhooks. See
[ADR-013](decisions/013-github-integration-model.md) for why these are split.

---

## Step 2 — Grab your API key

The API key drives CLI authentication. It's displayed on the onboarding page
right after you sign in, and lives at:

```
https://ax-metrics.vercel.app/settings
```

On the Settings page you can **Rotate API Key** at any time. Rotation
immediately invalidates the previous key — any CLI still using the old one
will start failing with 401. Copy the new key into `~/.ax/config.json` or
re-run `ax init` after rotating.

Keys are stored server-side as bcrypt hashes. The raw key string is only
visible at the moment of creation or rotation, so paste it into your password
manager immediately.

---

## Step 3 — Connect your CLI

From any directory, run:

```bash
ax init --server https://ax.up.railway.app \
        --api-key <your-key> \
        --user "Your Name"
```

All three flags are required. `ax init` will:

1. Health-check `https://ax.up.railway.app` to confirm the server is
   reachable.
2. Validate the API key against the server.
3. Write `~/.ax/config.json` with the server URL, key, and attribution name.
4. Install a Claude Code `SessionEnd` hook into `~/.claude/settings.json`
   that runs `ax push` after each Claude Code session ends, automatically
   sending session data to the server.

Flag reference:

| Flag | Purpose |
|---|---|
| `--server <url>` | Server URL. Use `https://ax.up.railway.app`. |
| `--api-key <key>` | Your API key from the Settings page. |
| `--user "Name"` | Display name used for attribution on the dashboard. |
| `--uninstall` | Remove all hooks (does not touch `config.json`). |

To undo everything, run `ax init --uninstall`.

---

## Step 4 — Push your first data

Change into a git repo on your machine and run:

```bash
cd ~/code/your-repo
ax push --repo .
```

`ax push` does the following:

1. Parses Claude Code session JSONL files from `~/.claude/projects/` for
   sessions associated with this repo.
2. Identifies the repo via `git remote get-url origin`.
3. POSTs the session payload to `https://ax.up.railway.app/api/v1/push`.

After the initial push, the `SessionEnd` hook installed by `ax init` handles
this automatically — `ax push` runs after each Claude Code session ends.

---

## Step 5 — Install the GitHub App on your organization

> **Who needs to do this?** An org admin. This is a one-time step per
> GitHub organization.

Installing the AX GitHub App on your GitHub org enables:

- **Automatic webhook delivery** — PR, review, and CI events flow into AX
  in real time with no per-repo setup.
- **Installation-token-based repo access** — AX reads repo data through
  server-to-server tokens scoped to the installation, not individual user
  tokens.
- **Historical backfill** — on install, AX fetches recent PR history
  (default: 90 days) so your dashboard isn't empty on day one.

### How to install

1. Navigate to `https://ax-metrics.vercel.app/{your-org-slug}/settings`.
2. In the **GitHub App** card, click **Install GitHub App**. Only org
   admins see this button.
3. You'll be redirected to GitHub's app installation consent screen. Choose
   the organization you want to connect and select which repositories AX
   can access ("All repositories" or a subset).
4. After granting access, GitHub redirects you back to the AX settings
   page. A success banner confirms the installation, and background
   backfill begins automatically.

Once installed, new repositories added to the GitHub org are automatically
covered — no additional configuration needed.

### What happens behind the scenes

- The Rails server receives a callback with the `installation_id` and
  creates a `GithubInstallation` record linked to your AX org.
- A backfill job enqueues to fetch PRs from the last 90 days across all
  accessible repos and run them through the standard webhook handlers
  (`PrOpened`, `PrMerged`, `PrClosed`).
- Going forward, GitHub delivers webhook events (pull request, review,
  check suite) directly to the AX server — no CLI push required for
  GitHub-sourced metrics.

### Managing the installation

From `/{slug}/settings` you can see:

- **Status** — Connected (active) or Suspended.
- **Connected repos** — list of repositories linked to the installation.
- **Last synced** — when the most recent backfill or sync completed.
- **Manage on GitHub** — link to the installation settings page on GitHub,
  where you can change repo access or uninstall.

To uninstall, visit the GitHub installation settings page directly
(linked from the AX settings card). Uninstalling detaches the installation
but preserves all historical PR data and metrics.

---

## Step 6 — View results on the dashboard

Open `https://ax-metrics.vercel.app/{your-org-slug}`. On first sign-in your
org slug is your GitHub username.

**What you'll see today:**

- **Settings (`/settings`)** — API key management and rotation.
- **Onboarding (`/onboarding`)** — The first-time setup screen showing your
  API key and the exact `ax init` command for your account.
- **Org-scoped PR list (`/{slug}/prs`)** — PR table with inline metrics.
- **Org-scoped Compare (`/{slug}/compare`)** — Developer leaderboard with
  time window filters.
- **Org Settings (`/{slug}/settings`)** — Member list and invite management.

**Important:** metrics are only computed for **finalized** PRs (merged or
closed). Open PRs are deliberately excluded — see
[ADR-010](decisions/010-github-event-ingestion.md). If you just opened a
PR and don't see it, that's expected.

---

## Inviting teammates

From `/{slug}/settings`, an org admin can invite team members by GitHub
username. The invite flow is:

1. Admin creates an invite. Rails generates a single-use token.
2. Admin copies the invite link (`/invite/{token}`) and sends it to the
   teammate.
3. Teammate clicks the link.
   - If signed in: the invite is accepted server-side and they're redirected
     to `/{slug}`.
   - If not signed in: the token is stashed in a `pending_invite` cookie,
     they're redirected to `/login` to sign in with GitHub, and the invite
     is consumed automatically after the callback.
4. Once joined, the teammate follows Steps 2-4 of this guide: grab their own
   API key from `/settings`, run `ax init`, and push data.

Each teammate has their own API key. Keys are scoped per user, not per org.

---

## Current limitations (be honest about what isn't built)

| Area | Status | Tracked in |
|---|---|---|
| GitHub OAuth sign-in | Working | [ADR-013](decisions/013-github-integration-model.md) |
| API key auth + rotation | Working | — |
| `ax push` + `/api/v1/push` ingestion | Working | — |
| Org-scoped PR list UI | Working | — |
| Org-scoped Compare UI | Working | — |
| Member / invite management UI | Placeholder route | `plans/managed-service-identity.md` |
| Invite acceptance API + cookie flow | Working | — |
| GitHub App installation flow | Working | [ADR-013](decisions/013-github-integration-model.md) |
| Real-time webhooks for PR / review / CI events | Working | [ADR-013](decisions/013-github-integration-model.md) |
| Automatic repo ingestion (no CLI push required) | Working | [ADR-013](decisions/013-github-integration-model.md) |

Concretely: **session data enters via CLI push and GitHub-sourced PR data
enters via webhook delivery from the GitHub App.** Once an org admin installs
the AX GitHub App (Step 5), webhook events flow automatically and a backfill
job seeds historical PR data. The CLI push path remains available for session
metrics and for repos not covered by the GitHub App installation.

---

## Troubleshooting

### "Sign in with GitHub does nothing" / the dashboard bounces me in a loop

Two things to check:

1. **`AX_API_URL` on the dashboard deploy.** The Next.js app at
   `https://ax-metrics.vercel.app` reads `AX_API_URL` to know where to send
   auth requests. It should be set to `https://ax.up.railway.app`. If it
   defaults to `http://localhost:3000`, the OAuth redirect will fail on
   production. Check the Vercel environment variables for the project.

2. **GitHub OAuth App callback URL.** The OAuth App used for login must have
   its callback URL set to exactly:

   ```
   https://ax.up.railway.app/users/auth/github/callback
   ```

   A mismatch here silently breaks the Devise + OmniAuth callback. Check the
   OAuth App settings on GitHub.

### `ax push` returns 401

The API key stored in `~/.ax/config.json` is missing, wrong, or has been
rotated out from under you. Fix it by:

1. Going to `https://ax-metrics.vercel.app/settings`.
2. Clicking **Rotate API Key**. Copy the new key immediately — it's only
   shown once.
3. Re-running `ax init --server https://ax.up.railway.app --api-key <new-key>
   --user "Your Name"`. This overwrites `~/.ax/config.json` with the new
   key.

You can also hand-edit `~/.ax/config.json` if you'd rather skip the `init`
walkthrough.

### My PRs aren't showing up on the dashboard

Two possible causes:

1. **The PRs aren't finalized.** Metrics are only computed for merged or
   closed PRs. Open PRs are excluded by design.

2. **Session data hasn't been pushed.** If the `SessionEnd` hook hasn't
   fired yet (e.g. you haven't ended a Claude Code session since setup),
   run `ax push --repo .` manually.

### GitHub App installation failed

After clicking **Install GitHub App**, the settings page shows an error
banner instead of a success message. The error query parameter tells you
what went wrong:

| Error code | Meaning | Fix |
|---|---|---|
| `missing_installation_id` | GitHub did not return an installation ID in the callback. | Try installing again from the settings page. |
| `api_error` | The AX server could not verify the installation with GitHub's API. | Wait a moment and retry. If it persists, check GitHub's [status page](https://www.githubstatus.com/). |
| `invalid_state` | The install link expired or the state token was invalid. | Go back to `/{slug}/settings` and click **Install GitHub App** again to generate a fresh link. |
| `forbidden` | You do not have permission to install the GitHub App for this organization. | Only org admins can install. Ask an admin to perform the installation. |

If the installation succeeds but **no data appears**, the backfill job may
still be running. Check the "Last synced" timestamp on the GitHub App card
in settings — it updates when the backfill completes. For large orgs with
many repos, this can take several minutes.

### GitHub App shows "Suspended"

A GitHub org admin suspended the AX app installation from GitHub's settings.
While suspended, no webhook events are delivered and no new data flows in.
Existing data is preserved. To resume, visit the GitHub installation
settings page (linked from the AX settings card) and unsuspend the app.

### `ax init` says "server unreachable"

Hit the health endpoint directly to isolate the problem:

```bash
curl https://ax.up.railway.app/api/v1/health
```

If that fails, it's a network or Railway outage, not an AX bug. If it
succeeds but `ax init` still fails, double-check the URL you passed
— a trailing slash or `http://` instead of `https://` will cause the
health check to reject the response.

---

## Reference

- [ADR-008 — Distribution Strategy](decisions/008-distribution-strategy.md)
  — why `brew install acroos/tap/ax` is the only supported install path.
- [ADR-010 — GitHub Event Ingestion](decisions/010-github-event-ingestion.md)
  — why metrics only exist for finalized PRs.
- [ADR-013 — GitHub Integration Model](decisions/013-github-integration-model.md)
  — the OAuth App + GitHub App split, and the staged rollout plan.
- [ADR-014 — Remove Local Mode](decisions/014-remove-local-mode.md)
  — managed-only architecture decision.
- `plans/managed-service-identity.md` — auth, orgs, invites, API keys.
- `plans/comparison-views.md` — dashboard UI work in flight.
