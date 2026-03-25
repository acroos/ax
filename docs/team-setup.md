# AX Team Setup Guide

Deploy AX for your engineering team so every developer's Claude Code sessions automatically push metrics to a shared dashboard.

## What you'll set up

- A shared AX server (Go) that collects metrics from all team members
- A web dashboard (Next.js) accessible to your team
- Automatic data collection via Claude Code hooks on each developer's machine
- Server-side GitHub polling to detect PR merges and closures

**Time to complete:** ~20 minutes for the server admin, ~5 minutes per developer.

---

## Prerequisites

### Server (whoever deploys)

- **Docker and Docker Compose v2+** — or a Kubernetes cluster with Helm
- **GitHub personal access token** with `repo` scope — for server-side PR state polling
- **Network access** from developer machines to the server (port 8080 for API, port 3333 for dashboard)

### Each developer

- **`ax` CLI** installed: `brew install acroos/tap/ax` or download from [GitHub Releases](https://github.com/acroos/ax/releases)
- **Claude Code** installed and working
- **`gh` CLI** installed and authenticated (for local syncing)

---

## Option A: Docker Compose (Single Server)

Best for small-to-medium teams on a single server or VM.

### Step 1: Clone and configure

```bash
git clone https://github.com/acroos/ax.git
cd ax

# Create environment file
cp .env.example .env
```

Edit `.env`:
```bash
# Required: GitHub token for server-side PR polling
GH_TOKEN=ghp_your_github_token_here

# Required: PostgreSQL password (change this!)
POSTGRES_PASSWORD=a-strong-password-here
```

### Step 2: Start services

```bash
docker compose up -d
```

Verify everything is running:
```bash
docker compose ps
```

You should see four services: `postgres`, `server`, `dashboard`, `watcher` — all "Up".

### Step 3: Generate an API key

```bash
docker compose exec server ax server init
```

Output:
```
AX server initialized.
Your API key: ax_k1_a3f8c9d2e1b4...

Share this key securely with your team.
Each developer will need it for 'ax init --team'.
```

**Save this key** — it's only shown once. Share it with your team via a secure channel (1Password, Slack DM, etc.).

To create additional keys (e.g., per-team or per-developer):
```bash
docker compose exec server ax server create-key "backend-team"
```

### Step 4: Verify the server

```bash
# Health check (no auth required)
curl http://your-server:8080/api/v1/health
# Expected: {"status":"ok"}

# Open the dashboard
open http://your-server:3333
# You should see the AX dashboard (empty until developers push data)
```

---

## Option B: Kubernetes (Helm Chart)

Best for teams that run everything on K8s.

### Step 1: Add the Helm repo

```bash
# From the ax repo (until we publish to a Helm registry)
cd deploy/helm
```

### Step 2: Install

```bash
helm install ax ./ax \
  --set postgresql.auth.password=a-strong-password \
  --set github.token=ghp_your_github_token
```

Or with a custom values file:
```bash
helm install ax ./ax -f my-values.yaml
```

### Step 3: Generate an API key

```bash
kubectl exec -it deploy/ax-server -- ax server init
```

### Step 4: (Optional) Enable ingress

In your values file or via `--set`:
```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: ax.internal.company.com
      paths:
        - path: /api
          pathType: Prefix
          service: server
        - path: /
          pathType: Prefix
          service: dashboard
  tls:
    - secretName: ax-tls
      hosts:
        - ax.internal.company.com
```

### Step 5: Verify

```bash
kubectl get pods -l app.kubernetes.io/name=ax
# Should show: ax-server, ax-dashboard, ax-watcher, ax-postgresql — all Running

curl https://ax.internal.company.com/api/v1/health
# Expected: {"status":"ok"}
```

---

## Developer Setup

Share these instructions with each developer on your team.

### Step 1: Install ax

```bash
brew install acroos/tap/ax
```

Or download from [GitHub Releases](https://github.com/acroos/ax/releases).

### Step 2: Connect to your team server

```bash
ax init --team http://your-server:8080 \
        --api-key ax_k1_a3f8c9d2e1b4... \
        --user "Your Name"
```

This walks you through a 4-step setup:
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
  Pushed to http://your-server:8080 (15 PRs, 3 sessions)
```

### Step 4: Verify on dashboard

Open the team dashboard and confirm your repo appears with metrics.

---

## Verification Checklist

After setup, confirm each of these:

- [ ] `curl <server>:8080/api/v1/health` returns `{"status":"ok"}`
- [ ] Dashboard at `<server>:3333` loads
- [ ] At least one developer has run `ax sync --repo .` successfully
- [ ] Pushed data appears on the dashboard
- [ ] Start and end a Claude Code session — new data appears within 60 seconds
- [ ] Merge a PR on GitHub — watcher finalizes metrics within 5 minutes
- [ ] `ax status` shows the repo with "watching" status

---

## How It Works

```
Developer machines                    Team server
┌──────────────────┐                 ┌──────────────────────────────┐
│ Claude Code      │                 │                              │
│   ↓ session end  │                 │  server (Go, :8080)          │
│ ax sync          │──── POST ──────→│    /api/v1/push              │
│   ↓ auto-push    │                 │    writes → Postgres         │
│                  │                 │                              │
└──────────────────┘                 │  dashboard (Next.js, :3333)  │
                                     │    reads via /api/v1/*       │
                                     │                              │
                                     │  watcher (Go)                │
                                     │    polls GitHub via gh CLI   │
                                     │    writes → Postgres         │
                                     └──────────────────────────────┘
```

- **When a Claude Code session ends**, the SessionEnd hook triggers `ax sync`, which syncs locally and auto-pushes to the team server.
- **The watcher** polls GitHub every 5 minutes for PR state changes (merges, closures) and finalizes metrics.
- **Metrics are only computed** for merged or closed PRs — open PRs don't appear in reports or the dashboard.

---

## Security Considerations

### Network access

- The AX server does **not** handle TLS. For production deployments, put it behind a reverse proxy (Caddy, nginx, Traefik) with HTTPS.
- Restrict network access to your internal network or VPN. Do not expose the server to the public internet without TLS.

### API keys

- Keys are stored as **bcrypt hashes** on the server — the raw key is only shown at creation time.
- If a key is compromised:
  ```bash
  # Docker Compose
  docker compose exec server ax server revoke-key "key-name"

  # Kubernetes
  kubectl exec deploy/ax-server -- ax server revoke-key "key-name"
  ```
- Generate a new key and distribute to affected team members.

### Data sensitivity

The database contains:
- Repo names, PR titles, branch names
- Session token counts and dollar costs
- Commit messages and author names

It does **not** contain:
- Source code or file contents
- Claude conversation content
- Credentials or secrets

Treat the database as internal/confidential.

### GitHub token

- The `GH_TOKEN` needs `repo` scope to poll PR status.
- Use a machine user or bot account if possible.
- The token is only used server-side by the watcher — it never leaves the server.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `ax init --team` says "connection refused" | Server not running or wrong URL | Check `docker compose ps`; verify URL includes port |
| `ax init --team` says "API key is invalid" | Wrong key or key revoked | Verify key; admin can check with `ax server list-keys` |
| `ax push` hangs | Network issue or server overloaded | Check connectivity; try `curl <server>:8080/api/v1/health` |
| Dashboard shows no data | No data pushed yet | Run `ax sync --repo .` in a repo |
| Dashboard shows no finalized PRs | Only open PRs in data | Metrics only appear for merged/closed PRs |
| Watcher logs: "gh: not found" | gh CLI missing in container | Rebuild: `docker compose build watcher` |
| Watcher logs: auth errors | `GH_TOKEN` not set or expired | Update `.env`; restart: `docker compose restart watcher` |
| "database is locked" (SQLite) | Only relevant for local mode | Use Postgres for team deployments |
| Push returns 500 | Server-side error | Check server logs: `docker compose logs server` |

---

## Updating

```bash
cd /path/to/ax
git pull
docker compose build
docker compose up -d
```

The database schema auto-migrates on server startup. No manual migration steps needed.

For Kubernetes:
```bash
helm upgrade ax deploy/helm/ax/ -f my-values.yaml
```

---

## Managing API Keys

```bash
# List all keys
docker compose exec server ax server list-keys

# Create a new key
docker compose exec server ax server create-key "new-team-member"

# Revoke a key
docker compose exec server ax server revoke-key "compromised-key"
```

Each developer can also override their key:
```bash
ax push --api-key ax_k1_new_key_here
```

Or update their config:
```bash
# Edit ~/.ax/config.json and change the api_key value
```

---

## GitHub Webhooks (Optional, Recommended)

By default, AX detects PR merges via polling every 5 minutes. For real-time finalization, configure GitHub webhooks to push events directly to the server.

### Setup

1. In your GitHub repo (or org settings), go to **Settings → Webhooks → Add webhook**

2. Configure:
   - **Payload URL:** `https://your-server:8080/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** A strong random string (you'll add this to `.env`)
   - **Events:** Select "Pull requests", "Pull request reviews", and "Check suites"

3. Add the secret to your server environment:
   ```bash
   # Add to .env
   AX_WEBHOOK_GITHUB_SECRET=your-webhook-secret-here

   # Restart the server
   docker compose restart server
   ```

4. Verify by merging a PR — metrics should finalize within seconds.

Polling continues to run as a fallback even with webhooks configured.

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

Available formats: `json`, `jsonl`, `csv`. Data defaults to finalized PRs only.

---

## Dashboard Features

The team dashboard includes:

| Page | URL | What it shows |
|------|-----|---------------|
| **Overview** | `/` | Aggregate metric cards with sparklines and trend charts |
| **Pull Requests** | `/prs` | Table of all finalized PRs with inline metrics |
| **PR Detail** | `/prs/[id]` | 15 metrics grouped by category for a single PR |
| **Compare** | `/compare` | Developer leaderboard, individual vs team comparison, time window filtering |
| **Docs** | `/docs` | In-dashboard metric documentation |

### Compare Page

The `/compare` page helps teams understand individual and team-wide patterns:

- **Developer leaderboard** — All developers ranked by PR count, with metrics columns
- **Individual vs team** — Select a developer to see their metrics side-by-side with team averages
- **Time filtering** — 7d, 30d, 90d, or all-time windows

Developer data requires PRs to have author information, which is populated automatically when `ax sync` runs.
