# AX Team Setup Guide

Connect your team to the AX managed service so everyone's Claude Code sessions and PR metrics flow into a shared dashboard.

## What you'll set up

- Each developer connected to the managed service at `app.ax.dev`
- Automatic data collection via Claude Code hooks on each developer's machine
- Real-time metric finalization via GitHub webhooks
- Org-based multi-tenancy with GitHub OAuth

**Time to complete:** ~5 minutes per developer.

---

## Prerequisites

### Each developer

- **`ax` CLI** installed: `brew install acroos/tap/ax` or download from [GitHub Releases](https://github.com/acroos/ax/releases)
- **Claude Code** installed and working
- **`gh` CLI** installed and authenticated (for local syncing)

### Org admin

- An AX account at `app.ax.dev` (sign up with GitHub OAuth)
- Waitlist approval to create a team organization

---

## Getting Started

### Step 1: Sign up

Visit [app.ax.dev](https://app.ax.dev) and sign in with GitHub. A personal organization is created automatically using your GitHub username.

### Step 2: Create a team organization (admin)

If you've been approved on the waitlist, create a new organization from the dashboard. Choose a slug (e.g., `my-team`) — this becomes part of your dashboard URL.

### Step 3: Invite your team (admin)

From **Organization Settings → Invites**, enter each team member's GitHub username and assign a role (admin or member). Copy the invite link and share it.

Invited users can sign up freely — no waitlist required for joining an existing org.

### Step 4: Get your API key

After signing in, your API key is shown on the onboarding page and available in **Settings**. Each developer gets one key, scoped to their user account.

---

## Developer Setup

Share these instructions with each developer on your team.

### Step 1: Install ax

```bash
brew install acroos/tap/ax
```

### Step 2: Connect to the managed service

```bash
ax init --team https://api.ax.dev \
        --api-key ax_k1_your_key_here \
        --user "Your Name"
```

This walks you through setup:
1. Tests server connectivity
2. Validates your API key
3. Saves team config to `~/.ax/config.json`
4. Installs Claude Code hooks for automatic syncing

### Step 3: Initial sync

```bash
cd /path/to/your/repo
ax sync --repo .
```

You should see:
```
Sync complete for owner/repo
  PRs synced: 15
  Sessions parsed: 3
  Sessions correlated: 2
  Pushed to https://api.ax.dev (15 PRs, 3 sessions)
```

### Step 4: Verify on dashboard

Open [app.ax.dev](https://app.ax.dev) and confirm your repo appears with metrics.

---

## GitHub Webhooks (Recommended)

For real-time metric finalization, configure GitHub webhooks to push events directly to the server.

### Setup

1. In your GitHub repo (or org settings), go to **Settings → Webhooks → Add webhook**

2. Configure:
   - **Payload URL:** `https://api.ax.dev/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** A strong random string (coordinate with AX admin)
   - **Events:** Select "Pull requests", "Pull request reviews", and "Check suites"

3. Verify by merging a PR — metrics should finalize within seconds.

---

## How It Works

```
Developer machines                    Managed service (app.ax.dev)
┌──────────────────┐                 ┌──────────────────────────────┐
│ Claude Code      │                 │                              │
│   ↓ session end  │                 │  Rails API                   │
│ ax sync          │──── POST ──────→│    /api/v1/push              │
│   ↓ auto-push    │                 │    writes → Postgres         │
│                  │                 │                              │
└──────────────────┘                 │  Next.js dashboard           │
                                     │    reads via /api/v1/*       │
GitHub                               │                              │
┌──────────────────┐                 │  Sidekiq (background jobs)   │
│ PR events        │──── webhook ──→ │    processes GitHub events   │
│ Review events    │                 │    finalizes metrics         │
│ CI events        │                 │                              │
└──────────────────┘                 └──────────────────────────────┘
```

- **When a Claude Code session ends**, the SessionEnd hook triggers `ax sync`, which syncs locally and auto-pushes to the managed service.
- **GitHub webhooks** notify the server of PR state changes (merges, reviews, CI) for real-time metric finalization.
- **Metrics are only computed** for merged or closed PRs — open PRs don't appear in reports or the dashboard.

---

## Security

### API keys

- Keys are stored as **bcrypt hashes** — the raw key is only shown at creation time.
- Each developer has one key, scoped to their user account.
- Keys can be rotated from the Settings page. Rotating immediately invalidates the old key.

### Data sensitivity

The database contains:
- Repo names, PR titles, branch names
- Session token counts and dollar costs
- Commit messages and author names

It does **not** contain:
- Source code or file contents
- Claude conversation content
- Credentials or secrets

### Authentication

- **Dashboard:** GitHub OAuth via Devise + OmniAuth. Session cookies with 30-day expiry.
- **CLI push:** API key in `Authorization: Bearer` header.
- **Webhooks:** HMAC-SHA256 signature validation.

---

## Verification Checklist

After setup, confirm each of these:

- [ ] Dashboard at [app.ax.dev](https://app.ax.dev) loads and shows your org
- [ ] At least one developer has run `ax sync --repo .` successfully
- [ ] Pushed data appears on the dashboard
- [ ] Start and end a Claude Code session — new data appears within 60 seconds
- [ ] (If webhooks configured) Merge a PR — metrics finalize within seconds

---

## Exporting Data

Use `ax export` to extract metrics for BI tools, spreadsheets, or custom integrations:

```bash
# JSON (default)
ax export --repo .

# CSV for spreadsheets
ax export --format csv --all-repos --output metrics.csv

# JSONL for streaming/piping
ax export --format jsonl --since 2026-01-01 | jq '.metrics.token_cost_usd'

# Repo-level aggregates
ax export --aggregate --all-repos --format csv
```

---

## Dashboard Features

The team dashboard includes:

| Page | URL | What it shows |
|------|-----|---------------|
| **Overview** | `/{slug}` | Aggregate metric cards with sparklines and trend charts |
| **Pull Requests** | `/{slug}/prs` | Table of all finalized PRs with inline metrics |
| **Compare** | `/{slug}/compare` | Developer leaderboard, individual vs team comparison, time window filtering |
| **Org Settings** | `/{slug}/settings` | Member management, invites |
| **Docs** | `/docs` | In-dashboard metric documentation |

### Compare Page

The compare page helps teams understand individual and team-wide patterns:

- **Developer leaderboard** — All developers ranked by PR count, with metrics columns
- **Individual vs team** — Select a developer to see their metrics side-by-side with team averages
- **Time filtering** — 7d, 30d, 90d, or all-time windows

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `ax init --team` says "connection refused" | Server not reachable | Check network connectivity to api.ax.dev |
| `ax init --team` says "API key is invalid" | Wrong key or key revoked | Verify key in Settings; rotate if needed |
| `ax push` hangs | Network issue | Try `curl https://api.ax.dev/api/v1/health` |
| Dashboard shows no data | No data pushed yet | Run `ax sync --repo .` in a repo |
| Dashboard shows no finalized PRs | Only open PRs in data | Metrics only appear for merged/closed PRs |
| Push returns 401 | API key invalid or revoked | Rotate key in Settings; update `~/.ax/config.json` |
