# AX Team Setup

Connect the `ax` CLI to the AX managed service so your team's PR metrics,
Claude Code session data, and cost figures flow into a shared dashboard.

This guide is for developers setting up AX in **managed mode**. If you just
want everything running locally against `~/.ax/ax.db`, run `ax init` with no
flags and skip this doc.

---

## What managed mode gives you

- **Team-wide aggregation.** Every developer's finalized PRs, session costs,
  and agent-behavior metrics land in a single Postgres-backed store.
- **A shared dashboard.** One URL per organization at
  `https://ax-metrics.vercel.app/{org-slug}` where anyone on the team can
  compare developers, filter by time window, and drill into individual PRs.
- **Historical trends across developers.** The Compare page ranks developers,
  shows individual-vs-team deltas, and supports 7d / 30d / 90d / all-time
  windows.
- **No self-hosted option.** Managed mode runs on the AX-hosted Rails API at
  `https://ax.up.railway.app`. There is no self-hosted server distribution.

Local mode and managed mode are not mutually exclusive. Your `~/.ax/ax.db`
continues to be the source of truth on your machine, and `ax push` forwards
finalized PR metrics from that local store to the managed service.

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
  Claude Code, session metrics will be empty but git and GitHub metrics still
  work.

- **`gh` CLI, authenticated.** `ax sync` shells out to `gh` for PR, review,
  and check-run data. Run `gh auth status` to confirm you're logged in.

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

The OAuth App used for login is separate from the GitHub App that will
eventually handle repo data and webhooks. See
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
re-run `ax init --team` after rotating.

Keys are stored server-side as bcrypt hashes. The raw key string is only
visible at the moment of creation or rotation, so paste it into your password
manager immediately.

---

## Step 3 — Connect your CLI

From any directory, run:

```bash
ax init --team https://ax.up.railway.app \
        --api-key <your-key> \
        --user "Your Name"
```

All three flags are required in team mode. `ax init` will:

1. Health-check `https://ax.up.railway.app` to confirm the server is
   reachable.
2. Validate the API key against the server.
3. Write `~/.ax/config.json` with the server URL, key, and attribution name.
4. Install Claude Code hooks into `~/.claude/settings.json` — specifically a
   `SessionEnd` hook that runs `ax sync` after each Claude Code session ends.
5. Install a background GitHub poller (`launchd` on macOS, `cron` on Linux)
   that runs `ax watch --once` every 5 minutes by default.

If you want mid-session sync as well, pass `--live`:

```bash
ax init --team https://ax.up.railway.app \
        --api-key <your-key> \
        --user "Your Name" \
        --live
```

This adds a `Stop` hook that runs a lightweight `ax sync --sessions-only`
after each Claude Code response, so cost and session metrics update in
near-real-time rather than waiting for the session to end.

Flag reference:

| Flag | Purpose |
|---|---|
| `--team <url>` | Managed service URL. Use `https://ax.up.railway.app`. |
| `--api-key <key>` | Your API key from the Settings page. |
| `--user "Name"` | Display name used for attribution on the dashboard. |
| `--live` | Also install the `Stop` hook for mid-session sync. |
| `--no-watch` | Skip background GitHub polling installation. |
| `--watch-interval <seconds>` | Override the default 300-second poll interval. |
| `--uninstall` | Remove all hooks and polling (does not touch `config.json`). |

To undo everything, run `ax init --uninstall`.

---

## Step 4 — First sync

Change into a git repo on your machine and run a full sync:

```bash
cd ~/code/your-repo
ax sync --repo .
```

`ax sync` does the following, in order:

1. Shells out to `git log` / `git diff` to ingest commits and diffs.
2. Shells out to `gh` to pull PRs, reviews, and check runs for the repo.
3. Parses Claude Code session JSONL files from `~/.claude/projects/` and
   correlates sessions to PRs by branch and time window.
4. Computes all 16 metrics for PRs that have reached a terminal state
   (merged or closed).
5. If `~/.ax/config.json` has a server URL configured, automatically pushes
   the resulting payload to `https://ax.up.railway.app/api/v1/push`.

That auto-push means you usually don't need to run `ax push` manually. If
you want to push without re-syncing — for example after tweaking local data,
or if the auto-push failed — run:

```bash
ax push --repo .
```

`ax push` reads the server URL and API key from `~/.ax/config.json`, extracts
the finalized PR payload from `~/.ax/ax.db`, and POSTs it to `/api/v1/push`.
You can override either with `--server` or `--api-key`.

For a fast iteration loop (no GitHub API calls, just re-parse Claude Code
sessions), use:

```bash
ax sync --sessions-only --repo .
```

---

## Step 5 — View results on the dashboard

Open `https://ax-metrics.vercel.app/{your-org-slug}`. On first sign-in your
org slug is your GitHub username.

**What you'll see today:**

- **Settings (`/settings`)** — API key management and rotation. Fully wired
  up.
- **Onboarding (`/onboarding`)** — The first-time setup screen showing your
  API key and the exact `ax init --team` command for your account.
- **Org-scoped PR list (`/{slug}/prs`)** — Route exists, but currently
  renders a placeholder. Full PR table is under active development.
- **Org-scoped Compare (`/{slug}/compare`)** — Route exists; see
  `plans/comparison-views.md` for status.
- **Org Settings (`/{slug}/settings`)** — Route exists; member list and
  invite UI render placeholders while they're being built.

**Important:** metrics are only computed for **finalized** PRs (merged or
closed). Open PRs are deliberately excluded from reports and the dashboard —
see [ADR-010](decisions/010-github-event-ingestion.md). If you just opened a
PR and don't see it, that's expected.

To inspect a specific PR locally before it shows up on the dashboard:

```bash
ax report --pr 42
```

---

## Inviting teammates

From `/{slug}/settings` (once the UI is implemented), an org admin can
invite team members by GitHub username. The invite flow is:

1. Admin creates an invite. Rails generates a single-use token.
2. Admin copies the invite link (`/invite/{token}`) and sends it to the
   teammate.
3. Teammate clicks the link.
   - If signed in: the invite is accepted server-side and they're redirected
     to `/{slug}`.
   - If not signed in: the token is stashed in a `pending_invite` cookie,
     they're redirected to `/login` to sign in with GitHub, and the invite
     is consumed automatically after the callback.
4. Once joined, the teammate follows Steps 2–4 of this guide: grab their own
   API key from `/settings`, run `ax init --team`, and run `ax sync`.

Each teammate has their own API key. Keys are scoped per user, not per org.

---

## Current limitations (be honest about what isn't built)

Managed mode is under active development. Here's what works today and
what's still coming:

| Area | Status | Tracked in |
|---|---|---|
| GitHub OAuth sign-in | Working | [ADR-013](decisions/013-github-integration-model.md) |
| API key auth + rotation | Working | — |
| `ax push` + `/api/v1/push` ingestion | Working | — |
| Org-scoped PR list UI | Placeholder route | `plans/comparison-views.md` |
| Org-scoped Compare UI | Placeholder route | `plans/comparison-views.md` |
| Member / invite management UI | Placeholder route | `plans/managed-service-identity.md` |
| Invite acceptance API + cookie flow | Working | — |
| GitHub App installation flow | **Not built** | [ADR-013](decisions/013-github-integration-model.md) |
| Real-time webhooks for PR / review / CI events | **Not built** | [ADR-013](decisions/013-github-integration-model.md), `plans/event-service.md` |
| Automatic repo ingestion (no CLI push required) | **Not built** | [ADR-013](decisions/013-github-integration-model.md) |

Concretely: **today, all data enters the managed service via CLI push.**
There is no automatic ingestion, no org-wide GitHub App install, and no
real-time webhook finalization. Metrics appear on the dashboard only after
one of your developers next runs `ax sync` + (auto-)`ax push`.

The GitHub App installation flow described in ADR-013 — one-click install
on an org, automatic webhook delivery, installation-token-based repo reads —
is the target end state. It is not yet implemented. Until then, the
background poller installed by `ax init` (`ax watch`, every 5 minutes) is
the mechanism that keeps managed-mode data fresh.

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
3. Re-running `ax init --team https://ax.up.railway.app --api-key <new-key>
   --user "Your Name"`. This overwrites `~/.ax/config.json` with the new
   key.

You can also hand-edit `~/.ax/config.json` if you'd rather skip the `init`
walkthrough.

### My PRs aren't showing up on the dashboard

Three possible causes, in order of likelihood:

1. **The PRs aren't finalized.** Metrics are only computed for merged or
   closed PRs. Open PRs are excluded by design. Confirm locally:

   ```bash
   ax report --pr <number>
   ```

   If `ax report` says the PR isn't tracked or has no metrics, the PR is
   still open.

2. **You haven't pushed yet.** Sync auto-pushes when `~/.ax/config.json`
   has a server URL, but if the auto-push failed (network, auth) the data
   stays local. Run `ax push --repo .` manually and watch for errors.

3. **Repo isn't tracked.** Run `ax status` to see which repos AX knows
   about. If the repo isn't listed, run `ax sync --repo .` from inside it.

### `ax init --team` says "server unreachable"

Hit the health endpoint directly to isolate the problem:

```bash
curl https://ax.up.railway.app/api/v1/health
```

If that fails, it's a network or Railway outage, not an AX bug. If it
succeeds but `ax init --team` still fails, double-check the URL you passed
— a trailing slash or `http://` instead of `https://` will cause the
health check to reject the response.

### The background poller isn't running

Check with:

```bash
ax watch status
```

On macOS, `ax init` installs a `launchd` agent; on Linux, a `cron` entry.
If `ax watch status` says "not installed," re-run `ax init --team ...` to
reinstall it, or install the poller alone with `ax watch install`.

---

## Reference

- [ADR-008 — Distribution Strategy](decisions/008-distribution-strategy.md)
  — why `brew install acroos/tap/ax` is the only supported install path.
- [ADR-010 — GitHub Event Ingestion](decisions/010-github-event-ingestion.md)
  — why metrics only exist for finalized PRs.
- [ADR-013 — GitHub Integration Model](decisions/013-github-integration-model.md)
  — the OAuth App + GitHub App split, and the staged rollout plan.
- `plans/managed-service-identity.md` — auth, orgs, invites, API keys.
- `plans/comparison-views.md` — dashboard UI work in flight.
- `plans/event-service.md` — webhook receiver design.
