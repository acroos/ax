# AX — Agentic Coding DX Metrics

## Context

There's no good way to measure how effective agentic coding workflows are. Tools like DX exist for general developer experience, but nothing targets the specific dynamics of working with AI coding agents — prompt efficiency, output quality, planning effectiveness, and agent behavior patterns.

AX is an open-source CLI + web dashboard that analyzes git history, GitHub PR data, and Claude Code session data to surface actionable metrics about agentic coding workflows. Designed for individual use initially, with a clear path to team-wide adoption and a potential managed service offering.

## Vision: Local → Team → Managed

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1-3: Local MVP                                           │
│  Engineer runs `ax sync` locally, views metrics in CLI/dashboard│
├─────────────────────────────────────────────────────────────────┤
│  Phase 4: Team / Self-Hosted                                    │
│  Central server ingests data from all engineers via hooks        │
│  DX/platform team runs the server, org-wide dashboard           │
├─────────────────────────────────────────────────────────────────┤
│  Phase 5: Managed Service                                       │
│  We host the server. Customers just install hooks + connect.    │
│  Like self-hosted API gateways vs managed API gateways.         │
└─────────────────────────────────────────────────────────────────┘
```

### Scaling Architecture (design for now, build later)

```
Layer 1: Collection    — Claude Code hooks on each engineer's machine (ax push)
Layer 2: Ingestion     — HTTP API receives session events + commit metadata
Layer 3: Storage       — SQLite (local) → Postgres (team/managed)
Layer 4: Computation   — Metric calculation (same core logic, different storage backend)
Layer 5: Presentation  — Dashboard (local Next.js → hosted app)
```

**Session data ingestion for teams:** Each engineer runs `ax init` once, which installs a Claude Code hook. After each session ends, the hook runs `ax push` to POST anonymized session events to the central ingestion API. Engineers authenticate via GitHub identity. No daemon needed — hooks run automatically within Claude Code's existing infrastructure.

### Technology

- **Go** for the CLI + core engine (`ax` binary). Single binary, no runtime dependency, fast startup. Distributed via Homebrew.
- **TypeScript/Next.js** for the dashboard. Deployed to Vercel in production.
- The CLI and dashboard communicate through the database (SQLite locally, Postgres for teams).

### Distribution

- **Homebrew:** Primary distribution channel. `brew install ax` (via a Homebrew tap initially, e.g., `brew tap austinroos/ax && brew install ax`). Eventually submit to homebrew-core once adoption warrants it.
- **GitHub Releases:** Pre-built binaries for macOS (arm64, amd64), Linux (amd64), Windows. GoReleaser automates this.
- **go install:** `go install github.com/austinroos/ax@latest` for Go developers.

## Approved Metrics (14)

### Prompt Efficiency
1. **Messages per PR** — human messages in Claude Code session(s) that produced a PR
2. **Iteration depth** — back-and-forth turn count (user→agent cycles)

### Output Quality
3. **Post-open commits** — commits landing after PR was opened
4. **First-pass acceptance rate** — % of PRs merged without reviewer change requests
5. **CI success rate** — % of commits/PRs passing CI on first push
6. **Diff churn** — lines written then rewritten before merge (wasted effort)
7. **Test coverage of generated code** — whether PRs include test file changes
8. **Line revisit rate** — how often the same lines are modified across different PRs (code stability)

### Planning Effectiveness
9. **Plan-to-implementation coverage** — how much of the final impl was captured in the plan
10. **Plan deviation score** — files planned vs files actually changed
11. **Scope creep detection** — changes beyond what was asked

### Agent Behavior
12. **Self-correction rate** — agent-initiated fixes vs human-requested changes
13. **Context efficiency** — files read vs files modified
14. **Error recovery efficiency** — attempts needed to resolve build/test/lint failures

### Deferred for Future Consideration
- **Time-to-PR** — wall-clock time is muddied by context switching; needs more thought on what to actually measure
- **Review feedback density** — low comment density might indicate rubber-stamping, not quality
- **PR size distribution** — treated as a dimension (S/M/L/XL) on other metrics, not a standalone metric

## Architecture

```
ax/
├── cmd/
│   └── ax/            # CLI entry point (Go)
├── internal/
│   ├── db/            # SQLite schema, migrations, queries
│   ├── parsers/       # Git, GitHub, Claude session parsers
│   ├── correlator/    # Session-to-PR correlation engine
│   ├── metrics/       # Metric calculators
│   └── sync/          # Orchestration
├── dashboard/         # Next.js web dashboard (TypeScript)
├── plans/             # Project planning artifacts
├── docs/              # Documentation (decisions, metrics, setup)
├── go.mod
├── go.sum
└── Makefile
```

Go module for the CLI + core engine. Separate Next.js app for the dashboard. The dashboard reads from the same SQLite database the CLI writes to.

### Data Sources

| Source | What it provides | Required? |
|--------|-----------------|-----------|
| Git | Commits, diffs, branches, blame | Yes |
| GitHub API (via `gh` CLI) | PRs, reviews, CI status, comments | Yes |
| Claude Code sessions (`~/.claude/`) | Messages, tool calls, branches, plans | Optional (enriches metrics) |

### Key Challenge: Session-to-PR Correlation

Correlate Claude Code sessions to PRs using a layered strategy (tried in order):

1. **Direct extraction** — parse session for `gh pr create` tool calls; extract PR URL from output
2. **Branch matching** — match session's `gitBranch` against PR head branches
3. **Commit matching** — extract commit SHAs from session's `git commit` tool calls; match against PR commits
4. **Time-window heuristic** — match session timestamps against PR creation time within the same repo

Store confidence level with each correlation.

### Data Model (SQLite)

**Core tables:**
- `repos` — tracked repositories (path, remote URL, GitHub owner/repo)
- `sessions` — Claude Code sessions (ID, repo, branch, timestamps, message count)
- `prs` — pull requests (number, branch, state, timestamps, additions/deletions/files_changed)
- `commits` — commits (SHA, repo, PR, session, is_claude_authored, is_post_open)
- `session_prs` — session-to-PR correlations with confidence level
- `pr_metrics` — computed metric snapshots per PR (all 14 metrics as columns)
- `plan_analyses` — plan-to-implementation analysis results (Phase 3)

Database location: `~/.ax/ax.db` locally. Postgres for team/managed deployments.

### CLI Commands

```
ax sync [--repo <path>] [--since <date>]   # Ingest data from Claude Code + git + GitHub
ax report [--repo <path>] [--pr <number>]   # Print metrics summary to terminal
ax dashboard                                 # Start local web dashboard
ax init [--repo <path>]                      # Set up Claude Code hooks for real-time capture
ax push [--server <url>]                     # Push local data to central server (team mode)
ax status                                    # Show tracked repos and last sync time
```

### Dashboard Pages

- **Overview** — aggregate metric cards with trend badges (last 30d vs previous 30d)
- **PR list** — sortable/filterable table of all PRs with key metrics
- **PR detail** — all 14 metrics for a single PR, with session timeline
- **Session explorer** — browse Claude Code sessions and their correlated PRs

### Dashboard UX Philosophy

**This is critical.** The dashboard must feel like Linear — sleek, minimal, intentional. Not a data dump. These metrics can easily feel meaningless without strong content design.

Key principles:
- **Every metric needs context.** Each metric card should include a short explanation of what it measures, why it matters, and what a "good" vs "concerning" value looks like. Not buried in docs — visible inline, always accessible (e.g., hover/expand).
- **Tell the story, not just the number.** Use trend lines, comparisons, and plain-language summaries ("Your first-pass acceptance rate improved 15% this month — your initial PR quality is getting stronger").
- **Visual hierarchy matters.** Not all 14 metrics are equally important at a glance. The overview should surface what's interesting/changed, not show everything equally.
- **Design inspiration: Linear.** Clean typography, restrained color palette, smooth animations, generous whitespace. Dark mode first. No dashboard clutter.
- **Ambiguity is honest.** Some metrics are signals, not verdicts. The UI should make this clear — e.g., "High line revisit rate could indicate fast iteration or unclear requirements. Look at plan deviation to disambiguate."

## Project Structure (expanded)

```
ax/
├── cmd/ax/            # CLI entry point (Go)
├── internal/          # Go packages (db, parsers, correlator, metrics, sync)
├── dashboard/         # Next.js web dashboard (TypeScript)
├── plans/             # Project plans (copy of planning artifacts)
├── docs/
│   ├── decisions/     # Architecture Decision Records (ADRs)
│   │   ├── TEMPLATE.md
│   │   ├── 001-metrics-selection.md
│   │   ├── 002-form-factor.md
│   │   ├── 003-target-scope.md
│   │   ├── 004-cli-language.md
│   │   ├── 005-session-ingestion-strategy.md
│   │   ├── 006-ux-philosophy.md
│   │   └── ...
│   ├── metrics/       # Deep-dive docs for each of the 14 metrics
│   │   ├── index.md   # Overview of all metrics
│   │   ├── messages-per-pr.md
│   │   ├── iteration-depth.md
│   │   └── ...        # One file per metric
│   ├── setup-guide.md # Step-by-step setup for new users
│   └── architecture.md # System architecture overview
├── go.mod
├── go.sum
├── Makefile
└── Goreleaser.yml     # Automated release builds
```

### Decision Records

Every significant decision gets an ADR in `docs/decisions/` using a lightweight format (inspired by MADR). Each record captures the context, decision, alternatives considered, and consequences. Decisions already made in this planning phase will be documented retroactively.

### Documentation Strategy

Documentation is a first-class deliverable, not an afterthought:

- **In-code:** Every package, parser, metric calculator, and non-obvious function gets clear GoDoc/JSDoc comments explaining what it does and why.
- **Metric docs (`docs/metrics/`):** Each metric gets its own page explaining: what it measures, why it matters, how it's calculated, what "good" vs "concerning" looks like, known limitations/ambiguities, and which data sources it requires.
- **Setup guide (`docs/setup-guide.md`):** Complete guide from install to first report — aimed at someone who has never seen the project before.
- **Architecture doc (`docs/architecture.md`):** System overview, data flow, key design decisions, and how the pieces fit together.
- **Dashboard docs page:** The dashboard itself includes a `/docs` route that renders the metric documentation — so users can understand any metric without leaving the app. Every metric card links to its doc page.

## Build Phases

### Phase 1: MVP — Git/GitHub Metrics + CLI

Metrics that need **only git + GitHub data** (no Claude Code session parsing):
- Post-open commits
- First-pass acceptance rate
- CI success rate
- Test coverage of generated code
- Diff churn
- Line revisit rate

Steps:
1. Initialize Go module, project structure, Makefile
2. Copy plan to `plans/`, create `docs/decisions/` with ADR template and all existing decisions, create `docs/metrics/` stubs
3. `internal/db/` — SQLite schema, migrations, connection
4. `internal/parsers/git.go` — commits, diffs, branches, blame
5. `internal/parsers/github.go` — PRs, reviews, CI status via `gh` CLI
6. `internal/metrics/output_quality.go` — the 6 metrics above
7. `internal/sync/sync.go` — orchestration
8. `cmd/ax/` — CLI with cobra: `sync`, `report`, `status` commands
9. GoReleaser config + Homebrew tap setup

**Deliverable:** `ax sync --repo .` → `ax report` shows metrics in terminal.

### Phase 2: Session Metrics + Dashboard

Add metrics that need **Claude Code session data**:
- Messages per PR
- Iteration depth
- Self-correction rate
- Context efficiency
- Error recovery efficiency

Steps:
1. `internal/parsers/claude_sessions.go` — parse `history.jsonl` and per-project session JSONLs
2. `internal/correlator/correlator.go` — session-to-PR correlation engine
3. `internal/metrics/prompt_efficiency.go` and `internal/metrics/agent_behavior.go`
4. Scaffold Next.js dashboard in `dashboard/` with Recharts
5. Build overview, PR list, PR detail, and session explorer pages
6. `ax dashboard` command — starts the Next.js app locally
7. Add trend calculations

### Phase 3: Plan Analysis + Hooks

Add metrics that need **plan files + deeper analysis**:
- Plan-to-implementation coverage
- Plan deviation score
- Scope creep detection

Steps:
1. Plan file parser (extract mentioned file paths from markdown)
2. Plan-to-diff comparison (file set intersection/difference)
3. Optional LLM-assisted semantic analysis behind `--analyze-plans` flag
4. `ax init` — inject Claude Code hooks config for real-time capture
5. Hook handler for prospective event capture

### Phase 4: Team / Self-Hosted (future)

- Central ingestion API (Go HTTP server or separate service)
- Postgres storage backend
- `ax push` command for engineers to sync data to central server
- Claude Code hooks auto-push via `ax push` after session end
- Org-wide dashboard views (team aggregates, individual breakdowns)
- Scheduled daily/weekly report generation

### Phase 5: Managed Service (future)

- Hosted ingestion + dashboard
- Customer onboarding: `ax init --server https://ax.example.com --org <org>`
- API key auth, org/team management
- Usage-based or per-seat pricing model

## Key Dependencies

### Go (CLI + core)
- `cobra` — CLI framework
- `mattn/go-sqlite3` or `modernc.org/sqlite` — SQLite driver (pure Go option avoids CGO)
- `charmbracelet/lipgloss` + `charmbracelet/bubbletea` — terminal UI/formatting
- `os/exec` — shell out to `git` and `gh` CLIs
- `gorelease` — automated release builds

### TypeScript (dashboard)
- Next.js — framework
- `recharts` — charting
- `better-sqlite3` — reads from same SQLite DB as CLI
- Tailwind CSS — styling

No GitHub SDK — shell out to `gh` CLI to avoid auth complexity.

## Configuration

`~/.ax/config.json`:
```json
{
  "repos": [
    { "path": "/path/to/repo", "github": "owner/repo" }
  ],
  "claudeDataDir": "~/.claude",
  "dbPath": "~/.ax/ax.db",
  "server": null
}
```

`ax sync --repo .` auto-detects the current repo and adds it to config if not already tracked.

## Verification Plan

1. **Phase 1:** Run `ax sync --repo /path/to/spray-wall-app` against a real repo with PR history. Run `ax report` and verify metrics match manual spot-checks (e.g., count post-open commits on a known PR via `gh pr view`).
2. **Phase 2:** Verify session correlation by checking that `ax report --pr <N>` shows the correct Claude Code session(s). Cross-reference with `~/.claude/history.jsonl` timestamps.
3. **Phase 3:** Create a test plan file, run `ax sync --analyze-plans`, and verify coverage/deviation scores match expected file overlap.

## Decided

- **Binary name:** `ax` (Go binary, distributed via Homebrew)
- **CLI commands:** `ax sync`, `ax report`, `ax dashboard`, `ax init`, `ax push`, `ax status`
- **Dashboard deployment:** Next.js app deployed to Vercel for the managed/hosted version.
- **`ax dashboard`:** Embeds a pre-built static export of the Next.js app into the Go binary (via `go:embed`). No Node.js required for end users. Contributors run `npm run dev` in `dashboard/` for development with hot reload.
- **In-code docs:** GoDoc comments on all exported types and functions. Clear package-level documentation.
