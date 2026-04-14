# AX Setup 🛠️

Get AX running in under 5 minutes. By the end of this guide you'll have
PR metrics, Claude Code session data, and cost figures flowing into a
shared dashboard.

---

## Prerequisites

Before you begin, make sure you have:

- ✅ **`ax` CLI** — Install via Homebrew:

  ```bash
  brew install acroos/tap/ax
  ```

  This is the primary distribution channel (see
  [ADR-008](decisions/008-distribution-strategy.md)). You can also build from
  source with `make build` if you're contributing.

- ✅ **A GitHub account** — Sign-in is GitHub OAuth. There is no email/password
  flow.

- ✅ **Claude Code** — The `ax` CLI reads session data from `~/.claude/projects/`
  and installs hooks into `~/.claude/settings.json`. If you're not using
  Claude Code yet, session metrics will be empty but GitHub-sourced metrics
  still work fine.

---

## Step 1 — Sign in to the dashboard 🔑

Open [`ax-metrics.vercel.app`](https://ax-metrics.vercel.app) and click
**Sign in with GitHub**. You'll be bounced through GitHub's OAuth consent
screen (scopes: `read:user` and `user:email`), then back to the dashboard.

On first sign-in, three things happen automatically:

1. A **user account** is created from your GitHub profile.
2. A **personal organization** is created (slugged from your GitHub username).
   You land on the onboarding page.
3. An **API key** is minted for you — you'll need it in Step 3.

> 💡 The OAuth App used for login is separate from the GitHub App that handles
> repo data and webhooks. See
> [ADR-013](decisions/013-github-integration-model.md) for why these are split.

---

## Step 2 — Grab your API key 🗝️

Your API key is how the CLI authenticates with AX. It's displayed on the
onboarding page right after you sign in, and you can always find it at:

```
https://ax-metrics.vercel.app/settings
```

> ⚠️ **Copy it now!** Keys are stored server-side as bcrypt hashes. The raw
> key string is only visible at the moment of creation or rotation — so paste
> it into your password manager right away.

On the Settings page you can **Rotate API Key** at any time. Rotation
immediately invalidates the previous key — any CLI still using the old one
will start failing with 401. After rotating, re-run `ax init` with the new
key.

---

## Step 3 — Connect your CLI 🔌

From any directory, run:

```bash
ax init --api-key <your-key>
```

That's the only flag you need! `ax init` will:

1. 🏥 Health-check the AX server to confirm it's reachable.
2. ✅ Validate your API key against the server.
3. 💾 Write `~/.ax/config.json` with your key.
4. 🪝 Install a Claude Code `SessionEnd` hook into `~/.claude/settings.json`
   that automatically runs `ax push` after each Claude Code session ends.

Flag reference:

| Flag | Purpose |
|---|---|
| `--api-key <key>` | **(Required)** Your API key from the Settings page. |
| `--uninstall` | Remove all AX hooks (does not touch `config.json`). |

To undo everything, run `ax init --uninstall`.

---

## Step 4 — Push your first data 📤

Change into a git repo on your machine and run:

```bash
cd ~/code/your-repo
ax push --repo .
```

Here's what happens under the hood:

1. Parses Claude Code session JSONL files from `~/.claude/projects/` for
   sessions associated with this repo.
2. Identifies the repo via `git remote get-url origin`.
3. POSTs the session payload to the AX server.

After the initial push, the `SessionEnd` hook installed by `ax init` handles
this automatically — no more manual pushes needed! 🎉

> 💡 **Got lots of repos?** Run `ax push --all` to discover all repos from
> your Claude Code history and push sessions for each one in bulk.

---

## Step 5 — Install the GitHub App on your organization 🐙

> **Who needs to do this?** An org admin. This is a one-time step per
> GitHub organization.

Installing the AX GitHub App unlocks the best parts of the system:

- 📡 **Automatic webhook delivery** — PR, review, and CI events flow into AX
  in real time with no per-repo setup.
- 🔒 **Installation-token-based repo access** — AX reads repo data through
  server-to-server tokens, not individual user tokens.
- ⏪ **Historical backfill** — On install, AX fetches the last 90 days of PR
  history so your dashboard isn't empty on day one.

### How to install

1. Go to `https://ax-metrics.vercel.app/{your-org-slug}/settings`.
2. In the **GitHub App** card, click **Install GitHub App** (admins only).
3. GitHub's consent screen appears — choose your org and select which repos
   AX can access ("All repositories" or a subset).
4. After granting access, you're redirected back. A success banner confirms
   the install, and background backfill starts automatically. ✅

Once installed, new repos added to the org are automatically covered — zero
additional config needed.

### What happens behind the scenes

- The server receives a callback with the `installation_id` and creates a
  `GithubInstallation` record linked to your AX org.
- A backfill job fetches PRs from the last 90 days across all accessible
  repos, running them through the standard webhook handlers (`PrOpened`,
  `PrMerged`, `PrClosed`).
- Going forward, GitHub delivers webhook events directly to the AX server —
  no CLI push required for GitHub-sourced metrics.

### Managing the installation

From `/{slug}/settings` you can see:

- **Status** — Connected (active) or Suspended
- **Connected repos** — List of repositories linked to the installation
- **Last synced** — When the most recent backfill or sync completed
- **Manage on GitHub** — Link to the GitHub installation settings page

To uninstall, visit the GitHub installation settings page (linked from the
AX settings card). Uninstalling detaches the installation but preserves all
historical data and metrics.

---

## Step 6 — View results on the dashboard 📈

Open `https://ax-metrics.vercel.app/{your-org-slug}`. On first sign-in your
org slug is your GitHub username.

**Here's what you'll find:**

| Page | What's there |
|------|-------------|
| **Overview** (`/{slug}`) | Aggregate metrics across all PRs, grouped by category |
| **PR List** (`/{slug}/prs`) | Table of all PRs with inline metrics |
| **Metric Drill-Down** (`/{slug}/metrics/{metric}`) | Historical trend and per-PR breakdown for any metric |
| **Compare** (`/{slug}/compare`) | Developer leaderboard with time window filters |
| **Org Settings** (`/{slug}/settings`) | Members, invites, and GitHub App management |
| **Account** (`/settings`) | API key management and rotation |
| **Docs** (`/docs`) | In-app metric reference |

> 📌 **Note:** Full metrics are only computed for **finalized** PRs (merged or
> closed). Open PRs appear in the list but aggregate stats use settled PRs
> only. See [ADR-010](decisions/010-github-event-ingestion.md) for the
> reasoning.

---

## Inviting teammates 👥

From `/{slug}/settings`, an org admin can invite team members by GitHub
username. Here's how it works:

1. 📩 Admin creates an invite — Rails generates a single-use token.
2. 📋 Admin copies the invite link (`/invite/{token}`) and sends it to the
   teammate.
3. 🔗 Teammate clicks the link:
   - **Already signed in?** The invite is accepted and they land on `/{slug}`.
   - **Not signed in?** The token is stashed in a cookie, they sign in with
     GitHub, and the invite is consumed automatically after the callback.
4. 🚀 Teammate follows Steps 2–4 of this guide: grab their API key from
   `/settings`, run `ax init`, and push data.

Each teammate gets their own API key. Keys are scoped per user, not per org.

---

## What's working today ✅

| Feature | Status |
|---|---|
| GitHub OAuth sign-in | ✅ Working |
| API key auth + rotation | ✅ Working |
| `ax push` + `ax push --all` data ingestion | ✅ Working |
| Org-scoped PR list with inline metrics | ✅ Working |
| Org overview with aggregate metrics | ✅ Working |
| Metric drill-down pages | ✅ Working |
| Developer comparison / leaderboard | ✅ Working |
| Member + invite management UI | ✅ Working |
| GitHub App installation flow | ✅ Working |
| Real-time webhooks (PR / review / CI) | ✅ Working |
| Historical backfill on GitHub App install | ✅ Working |

**In short:** session data enters via CLI push, and GitHub PR data enters via
webhooks from the GitHub App. Once an org admin installs the GitHub App
(Step 5), webhook events flow automatically and a backfill job seeds
historical PR data. The CLI push path handles session metrics and works for
repos not covered by the GitHub App installation.

---

## Troubleshooting 🔧

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

1. Going to [`ax-metrics.vercel.app/settings`](https://ax-metrics.vercel.app/settings).
2. Clicking **Rotate API Key**. Copy the new key immediately — it's only
   shown once.
3. Re-running `ax init --api-key <new-key>`. This overwrites
   `~/.ax/config.json` with the new key.

You can also hand-edit `~/.ax/config.json` if you'd rather skip `init`.

### My PRs aren't showing up on the dashboard

Two possible causes:

1. **The PRs aren't finalized.** Full metrics are only computed for merged
   or closed PRs. Open PRs appear in the list but won't have complete
   metrics yet.

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
succeeds but `ax init` still fails, check your network settings (VPN,
firewall, proxy) — the server URL is hardcoded in the CLI so there's
nothing to misconfigure on your end.

---

## Further reading 📖

- [ADR-008 — Distribution Strategy](decisions/008-distribution-strategy.md)
  — Why Homebrew is the primary install path
- [ADR-010 — GitHub Event Ingestion](decisions/010-github-event-ingestion.md)
  — Why metrics only exist for finalized PRs
- [ADR-013 — GitHub Integration Model](decisions/013-github-integration-model.md)
  — The OAuth App + GitHub App split
- [ADR-014 — Remove Local Mode](decisions/014-remove-local-mode.md)
  — Managed-only architecture decision
