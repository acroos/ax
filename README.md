# AX — Agentic Coding DX Metrics

**You're shipping PRs with Claude Code. But are they getting better?**

AX is for engineering teams using Claude Code and GitHub PR workflows.

AX measures what matters: cycle time, session effectiveness, adoption depth, and other metrics that tell you whether your AI coding workflow is working.

---

## What You Can Measure

**Delivery** — How fast and cleanly does code ship?
> Task cycle time · PR throughput · post-open commits

**Session Effectiveness** — How well do sessions use time and resources?
> Iteration depth · peak context window · autonomy score

**Adoption Maturity** — How deeply has the team adopted agent capabilities?
> Skill & tool usage · subagent delegation · rubber stamp rate

Every metric has a dedicated doc explaining what it measures, why it matters, and how to interpret values → [full metric reference](docs/metrics/index.md)

---

## How It Works

AX is a managed service with three components:

| Component | What it does |
|-----------|-------------|
| 🔧 **Go CLI** | Parses session data from Claude Code, Copilot CLI, and Cursor CLI and pushes it to the server. Installs hooks so this happens automatically. |
| 🚂 **Rails API** | Ingests session data and GitHub webhooks, computes all metrics server-side, manages orgs and auth. |
| 📈 **Next.js Dashboard** | Web UI at `https://www.axmetrics.dev` for viewing metrics, comparing developers, and managing your team. |

Data flows in two ways:
1. **Agent sessions** (Claude Code, Copilot CLI, Cursor CLI) → CLI uploads parsed local session data to the API
2. **GitHub PR events** → GitHub webhooks send PR, review, and CI data to the API

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
cd ax/cli && just build
# Binary at cli/bin/ax
```

### 2. Sign in to the dashboard

Open [`www.axmetrics.dev`](https://www.axmetrics.dev) and sign in with GitHub. You'll get an API key on the onboarding page.

### 3. Connect the CLI

```bash
ax init --api-key <your-key>
```

That's it! `ax init` does two things:

- Validates your API key and saves config to `~/.ax/config.json`
- Installs `sessionEnd` hooks for every supported agent it detects on your machine, so session data pushes automatically:
  - **Claude Code** → `~/.claude/settings.json` (user-level)
  - **Cursor CLI** → `~/.cursor/hooks.json` (user-level by default; pass `--scope repo` for a per-repo hook you can commit)
  - **Copilot CLI** → `.github/hooks/session-end.json` (repo-level only — Copilot doesn't support user-level hooks)

> **Using Copilot CLI?** Run `ax init` from inside each repo where you use Copilot, then commit the generated `.github/hooks/session-end.json` so your teammates get automatic collection too. (`ax init` skips this step when run outside a git repo.)

### 4. Push your first data

```bash
ax push --repo .
```

After this, the hook handles it automatically. View your results at `https://www.axmetrics.dev/{your-org-slug}`.

For PR and review metrics, install the GitHub App during setup.

See the [Setup Guide](docs/setup.md) for the full walkthrough, including GitHub App installation and team invites.

---

## Supported Agents

AX supports three AI coding agents out of the box: **Claude Code**, **Copilot CLI**, and **Cursor CLI**. Each agent is registered in `config/agents.yaml` with a static capability matrix that governs which fields and metrics it supplies. The CLI auto-detects which agents are installed and pushes sessions from all of them.

---

## Data Collection

AX collects:
- **Aggregated session metadata** (token counts, cost, timestamps, tool usage counts)
- **Commit and PR metadata** (titles, branch names, line-count stats) to correlate sessions with PRs

AX does **not** collect:
- Conversation content
- Source code
- File names

For the full breakdown of what is and isn't collected, see the **[Data Collection & Privacy](docs/data-collection.md)** doc (also available at `/docs/data-collection` on the dashboard).

---

## Docs

- [Metric Reference](docs/metrics/index.md) — All metrics, explained
- [Setup Guide](docs/setup.md) — Full setup walkthrough
- [Data Collection & Privacy](docs/data-collection.md) — Exactly what data AX collects and stores
- [Architecture Decision Records](docs/decisions/) — Why things are the way they are

---

## Contributing

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
