# AX — Agentic Coding DX Metrics

**You're shipping PRs with Claude Code. But are they getting better?**
AX is a CLI that measures what matters: cost per PR, first-pass acceptance, self-correction rate, and 13 other metrics that tell you whether your AI coding workflow is actually working.

Three commands. Two minutes. Zero config files.

---

## What it looks like

```
  acroos/escape-room-api
  Last synced: 2026-03-25 05:42:47

  METRIC                 VALUE    DESCRIPTION
  ------                 -----    -----------
  Avg post-open commits  2.0      Commits after PR opened
  First-pass acceptance  100%     PRs merged without changes requested
  CI success rate        100%     Checks passing on first push
  PRs with tests         50%      PRs that include test file changes
  Avg messages/PR        16.5     Human messages per PR
  Avg token cost/PR      $23.66   Dollar cost per PR
  Total token cost       $141.96  Across 6 PRs
  Self-correction rate   97%      Agent error recovery without human help
  Context efficiency     1.61     Files modified / files read
  Total PRs              6
```

Drill into any PR for the full picture:

```
  PR #8: Add routes API, grade/type system, and gym stats
  State: merged  |  Branch: routes-and-stats
  +1594 -8 across 27 files

  METRIC                   VALUE
  ------                   -----
  Post-open commits        2
  First-pass accepted      Yes
  CI success rate          100%
  Includes tests           Yes
  Diff churn (lines)       0
  Line revisit rate        2.18
  Messages                 18
  Iteration depth          18
  Token cost               $6.39
  Self-correction rate     87%
  Context efficiency       1.92
  Error recovery attempts  2
  Plan coverage            73%
  Plan deviation           90%
  Scope creep              No
```

---

## Install

### Homebrew

```bash
brew install acroos/tap/ax
```

### From source

```bash
git clone https://github.com/acroos/ax.git
cd ax
make build
# Binary at ./bin/ax
```

**Prerequisites:** git and the [GitHub CLI](https://cli.github.com/) (`gh`) authenticated. AX shells out to `git` and `gh` directly — no API keys, no SDK config.

---

## Quick Start

```bash
ax sync --repo /path/to/your/repo   # Ingest git + GitHub data
ax report                            # See aggregate metrics
ax report --pr 8                     # Drill into a specific PR
```

That's it. You have data.

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

## Automatic Sync

Set up once, never think about it again:

```bash
ax init   # Installs Claude Code hooks + background GitHub polling
```

After this, metrics update automatically when Claude Code sessions end and when PRs are merged or closed.

---

## Dashboard

```bash
ax dashboard
# Open http://localhost:3333
```

Dark-mode, Linear-inspired. Overview with aggregate metrics and sparklines, PR table with inline metrics, per-PR detail with all 15 metrics, and a compare page for team-wide developer leaderboards.

---

## Export

Machine-readable output for BI tools, spreadsheets, or custom integrations:

```bash
ax export --format csv --repo . --output metrics.csv
ax export --format jsonl --all-repos | jq '.metrics.token_cost_usd'
ax export --aggregate --format json
```

Formats: `json` (default), `jsonl` (streaming), `csv` (flat).

---

## Team Mode

Deploy a shared server so your whole team's metrics flow into one dashboard:

```bash
# Server admin
docker compose up -d
docker compose exec server ax server init  # generates API key

# Each developer
ax init --team https://your-server:8080 --api-key ax_k1_... --user "Name"
ax sync --repo .  # syncs locally + pushes to team server
```

Also supports Kubernetes via Helm chart. See the full [Team Setup Guide](docs/team-setup.md).

---

## GitHub Webhooks

For real-time metric finalization (instead of 5-minute polling):

1. Add a webhook to your GitHub repo pointing to `https://your-server:8080/webhooks/github`
2. Set `AX_WEBHOOK_GITHUB_SECRET` in your server environment
3. Select "Pull requests", "Pull request reviews", and "Check suites" events

---

## Claude Code Integration

AX is purpose-built for [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) workflows. It correlates Claude Code session data — messages, token usage, self-corrections — with your GitHub PRs to give you the full picture of each agent-assisted PR.

---

## Docs

- [Setup Guide](docs/setup-guide.md) — Full walkthrough from install to first report
- [Team Setup Guide](docs/team-setup.md) — Deploy for your team (Docker Compose + Helm)
- [Architecture](docs/architecture.md) — How the pieces fit together
- [Metric Reference](docs/metrics/index.md) — All 16 metrics, explained
- [Architecture Decision Records](docs/decisions/) — Why things are the way they are

---

## Contributing

Start with [CLAUDE.md](CLAUDE.md) — it covers project conventions, build commands, data flow, and the decision record process. Metric calculators live in `internal/metrics/` with corresponding test files. The `docs/` directory is treated as a first-class deliverable.

```bash
make build    # Build to bin/ax
make test     # Run all tests
make fmt      # Format code
make lint     # Lint (requires golangci-lint)
```

---

## License

MIT
