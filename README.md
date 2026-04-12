# AX — Agentic Coding DX Metrics

**You're shipping PRs with Claude Code. But are they getting better?**
AX measures what matters: cost per PR, first-pass acceptance, self-correction rate, and 13 other metrics that tell you whether your AI coding workflow is actually working.

---

## What You Can Measure

**Output quality** — Is the agent producing clean, mergeable work?
- Post-open commits, first-pass acceptance rate, CI success rate, PRs with tests, diff churn, line revisit rate

**Interaction efficiency** — How much hand-holding does the agent need?
- Messages per PR, iteration depth, self-correction rate, context efficiency, error recovery

**Cost** — Is this actually saving you money?
- Token cost per PR, total token cost, unmerged token spend

**Planning fidelity** — Does the agent build what you asked for?
- Plan-to-implementation coverage, plan deviation score, scope creep detection

Every metric has a dedicated doc explaining what it measures, why it matters, and how to interpret values. See the [full metric reference](docs/metrics/index.md).

---

## How It Works

AX is a managed service with three components:

- **Go CLI** — Parses Claude Code session data from your machine and pushes it to the server. Installs hooks so this happens automatically.
- **Rails API** — Ingests session data and GitHub webhooks, computes all 16 metrics server-side, manages orgs and auth.
- **Next.js Dashboard** — Web UI at `https://ax-metrics.vercel.app` for viewing metrics, comparing developers, and managing your team.

Data flows in two ways:
1. **Claude Code sessions** — CLI parses local session files and pushes to the API
2. **GitHub PR events** — Webhooks deliver PR, review, and CI data directly to the API

Metrics are computed server-side when PRs reach a terminal state (merged or closed).

---

## Quick Start

### 1. Install the CLI

```bash
brew install acroos/tap/ax
```

Or build from source:

```bash
git clone https://github.com/acroos/ax.git
cd ax && make build
# Binary at ./bin/ax
```

### 2. Sign in to the dashboard

Open `https://ax-metrics.vercel.app` and sign in with GitHub. You'll get an API key on the onboarding page.

### 3. Connect the CLI

```bash
ax init --server https://ax.up.railway.app \
        --api-key <your-key> \
        --user "Your Name"
```

This writes your config to `~/.ax/config.json` and installs a Claude Code `SessionEnd` hook that automatically pushes session data after each coding session.

### 4. Push your first data

```bash
ax push --repo .
```

After this, the hook handles it automatically. View results at `https://ax-metrics.vercel.app/{your-org-slug}`.

See the [Setup Guide](docs/setup.md) for the full walkthrough including team invites.

---

## Claude Code Integration

AX is purpose-built for [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) workflows. It correlates Claude Code session data — messages, token usage, self-corrections — with your GitHub PRs to give you the full picture of each agent-assisted PR.

---

## Docs

- [Metric Reference](docs/metrics/index.md) — All 16 metrics, explained
- [Setup Guide](docs/setup.md) — Full setup walkthrough
- [Architecture Decision Records](docs/decisions/) — Why things are the way they are

---

## Contributing

Start with [CLAUDE.md](CLAUDE.md) — it covers project conventions, build commands, and the decision record process.

```bash
make build    # Build to bin/ax
make test     # Run all tests
make fmt      # Format code
make lint     # Lint (requires golangci-lint)
```

---

## License

MIT
