# AX — Agentic Coding DX Metrics ✨

**You're shipping PRs with Claude Code. But are they getting better?**

AX measures what matters: cost per PR, first-pass acceptance, self-correction rate, and 13 other metrics that tell you whether your AI coding workflow is actually working.

---

## 📊 What You Can Measure

**🏗️ Output Quality** — Is the agent producing clean, mergeable work?
> Post-open commits · first-pass acceptance rate · CI success rate · PRs with tests · diff churn · line revisit rate

**💬 Prompt Efficiency** — How efficiently are you directing the agent?
> Messages per PR · iteration depth · token cost per PR · unmerged token spend

**🤖 Agent Behavior** — How well does the agent operate on its own?
> Self-correction rate · context efficiency · error recovery attempts

**🗺️ Planning Effectiveness** — Does the agent build what you asked for?
> Plan-to-implementation coverage · plan deviation score · scope creep detection

Every metric has a dedicated doc explaining what it measures, why it matters, and how to interpret values → [full metric reference](docs/metrics/index.md)

---

## ⚙️ How It Works

AX is a managed service with three components:

| Component | What it does |
|-----------|-------------|
| 🔧 **Go CLI** | Parses Claude Code session data from your machine and pushes it to the server. Installs hooks so this happens automatically. |
| 🚂 **Rails API** | Ingests session data and GitHub webhooks, computes all 16 metrics server-side, manages orgs and auth. |
| 📈 **Next.js Dashboard** | Web UI at `https://ax-metrics.vercel.app` for viewing metrics and managing your team. |

Data flows in two ways:
1. **Claude Code sessions** → CLI parses local session files and pushes to the API
2. **GitHub PR events** → Webhooks deliver PR, review, and CI data directly to the API

Metrics are computed server-side when PRs reach a terminal state (merged or closed).

---

## 🚀 Quick Start

### 1. Install the CLI

```bash
brew install acroos/tap/ax
```

Or build from source:

```bash
git clone https://github.com/acroos/ax.git
cd ax/cli && just build
# Binary at cli/bin/ax
```

### 2. Sign in to the dashboard

Open [`ax-metrics.vercel.app`](https://ax-metrics.vercel.app) and sign in with GitHub. You'll get an API key on the onboarding page.

### 3. Connect the CLI

```bash
ax init --api-key <your-key>
```

That's it! This validates your key, saves config to `~/.ax/config.json`, and installs a Claude Code `SessionEnd` hook that automatically pushes session data after each coding session. 🎉

### 4. Push your first data

```bash
ax push --repo .
```

After this, the hook handles it automatically. View your results at `https://ax-metrics.vercel.app/{your-org-slug}`.

👉 See the [Setup Guide](docs/setup.md) for the full walkthrough including GitHub App installation and team invites.

---

## 🔗 Claude Code Integration

AX is purpose-built for [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) workflows. It correlates Claude Code session data — messages, token usage, self-corrections — with your GitHub PRs to give you the full picture of each agent-assisted PR.

---

## 🔒 Data Collection

AX collects **aggregated session metadata** — token counts, cost, timestamps, tool usage counts — never conversation content, source code, or file names. Commit messages and PR metadata (titles, branch names, line-count stats) are also collected to correlate sessions with PRs.

For the full breakdown of what is and isn't collected, see the **[Data Collection & Privacy](docs/data-collection.md)** doc (also available at `/docs/data-collection` on the dashboard).

---

## 📚 Docs

- [Metric Reference](docs/metrics/index.md) — All 16 metrics, explained
- [Setup Guide](docs/setup.md) — Full setup walkthrough
- [Data Collection & Privacy](docs/data-collection.md) — Exactly what data AX collects and stores
- [Architecture Decision Records](docs/decisions/) — Why things are the way they are

---

## 🤝 Contributing

Start with [CLAUDE.md](CLAUDE.md) — it covers project conventions, build commands, and the decision record process.

```bash
just              # List all recipes (from root)
just cli-build    # Build CLI to cli/bin/ax
just cli-test     # Run CLI tests
just test         # Run all tests (CLI + server)
just lint         # Lint all projects
```

---

## License

MIT
