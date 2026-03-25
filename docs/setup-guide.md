# Getting Started with AX

You're an engineer using Claude Code. You're shipping PRs. You have *no idea* whether you're getting better at it, worse at it, or if that $47 PR should have cost $8.

AX fixes that. Three commands, two minutes, zero configuration files.

---

## The 60-Second Setup

```bash
# 1. Build ax (you'll need Go installed)
git clone https://github.com/acroos/ax.git
cd ax
make build

# 2. Sync a repo
./bin/ax sync --repo /path/to/your/repo

# 3. See your metrics
./bin/ax report
```

That's it. You now have data. If you want pictures instead of a terminal table:

```bash
./bin/ax dashboard
# Open http://localhost:3333
```

The rest of this guide is for people who want to understand what just happened, squeeze more out of it, or break things intentionally.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Your First Sync](#your-first-sync)
- [Reading Your Report](#reading-your-report)
- [The Dashboard](#the-dashboard)
- [Syncing Multiple Repos](#syncing-multiple-repos)
- [Session Data: The Good Stuff](#session-data-the-good-stuff)
- [How Metrics Are Calculated](#how-metrics-are-calculated)
- [Troubleshooting](#troubleshooting)
- [What's Next](#whats-next)

---

## Prerequisites

| Tool | Why | Check |
|------|-----|-------|
| **Go 1.21+** | Builds the `ax` binary | `go version` |
| **git** | You're reading this, so probably yes | `git --version` |
| **gh** (GitHub CLI) | Fetches PR data, reviews, CI status | `gh --version` |
| **Node.js 18+** | Only needed for the dashboard | `node --version` |

Don't have `gh`? Install it:

```bash
brew install gh        # macOS
# then authenticate:
gh auth login
```

AX shells out to `git` and `gh` instead of using SDKs. This means zero API key configuration — if `gh` works in your terminal, AX works too.

> **Deep dive:** Why shell out instead of using the GitHub API directly? See [ADR-004: CLI Language](decisions/004-cli-language.md) for the reasoning.

---

## Installation

### From source (recommended for now)

```bash
git clone https://github.com/acroos/ax.git
cd ax
make build
```

Your binary is at `./bin/ax`. You can move it to your PATH:

```bash
cp ./bin/ax /usr/local/bin/ax
```

### Verify it works

```bash
ax --version
ax --help
```

You should see the command list: `sync`, `report`, `status`, `dashboard`.

---

## Your First Sync

Navigate to any git repo with a GitHub remote and run:

```bash
ax sync --repo .
```

Here's what happens behind the curtain:

1. AX reads your git remote to find the GitHub owner/repo
2. It fetches all PRs via `gh pr list` (up to 100)
3. For each PR, it pulls reviews, CI checks, and commit data
4. It parses your Claude Code sessions from `~/.claude/` (if they exist)
5. It correlates sessions to PRs using branch names, commit SHAs, and PR URLs
6. It computes all available metrics and stores everything in `~/.ax/ax.db`

The whole thing is **idempotent** — run it ten times, get the same result. No duplicates, no corruption.

> **Deep dive:** The session-to-PR correlation uses a layered confidence strategy. Direct PR URL extraction is the most reliable, followed by branch matching, then commit SHA matching. See [Architecture: Correlation](architecture.md) for the full algorithm.

### What if I don't use Claude Code?

AX still works! You'll get the git/GitHub metrics (post-open commits, CI success rate, first-pass acceptance, test coverage, diff churn, line revisit rate). The session-dependent metrics (messages per PR, token cost, self-correction rate, etc.) will show as "—" until session data is available.

---

## Reading Your Report

```bash
ax report
```

This prints an aggregate view across all synced PRs:

```
  acroos/my-project
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

### Drill into a specific PR

```bash
ax report --pr 5
```

This shows every metric computed for that PR, including diff churn, line revisit rate, iteration depth, error recovery attempts, and token cost.

### What am I looking at?

Each metric tells you something different about your agentic coding workflow. Here's the cheat sheet:

| If you want to know... | Look at |
|------------------------|---------|
| Am I prompting efficiently? | Messages/PR, Iteration Depth |
| Is the initial output good enough? | Post-Open Commits, First-Pass Acceptance |
| Is the agent running checks before pushing? | CI Success Rate |
| Am I spending too much? | Token Cost/PR |
| Does the agent write tests? | Test Coverage |
| Does the agent fix its own mistakes? | Self-Correction Rate |
| Is the agent exploring too much or too little? | Context Efficiency |

> **Deep dive:** Every metric has a dedicated documentation page explaining exactly how it's calculated, what "good" vs "concerning" looks like, and known limitations. Browse them all at [Metrics Reference](metrics/index.md), or start with the one that surprised you.

---

## The Dashboard

The terminal is great. A visual dashboard is better.

```bash
ax dashboard
```

This starts a local web server at [http://localhost:3333](http://localhost:3333). The dashboard is a Next.js app that reads directly from the same `~/.ax/ax.db` database as the CLI.

### What you'll see

- **Overview** — Metric cards with values, descriptions, and info tooltips. Hover the `?` icon on any card to learn what the metric means and what values to aim for.
- **Pull Requests** — A table of every tracked PR with key metrics at a glance. Click any row to see the full breakdown.
- **PR Detail** — Every computed metric for a single PR, organized by category (Output Quality, Prompt Efficiency, Agent Behavior).

### Custom port

```bash
ax dashboard --port 8080
```

### Dashboard prerequisites

The dashboard needs Node.js 18+. On first run, `ax dashboard` will automatically install npm dependencies if they're missing.

---

## Syncing Multiple Repos

AX tracks repos independently. Sync as many as you want:

```bash
ax sync --repo ~/dev/project-a
ax sync --repo ~/dev/project-b
ax sync --repo ~/dev/project-c
```

Check what's tracked:

```bash
ax status
```

```
  REPO                  LAST SYNCED
  ----                  -----------
  acroos/project-a      2026-03-25 05:06:29
  acroos/project-b      2026-03-25 05:00:02
  acroos/project-c      2026-03-25 05:06:34
```

The dashboard and `ax report` aggregate across all repos by default. Per-repo filtering is coming in a future release.

---

## Session Data: The Good Stuff

The most interesting AX metrics come from Claude Code session data. This is the data that tells you *how* the work happened, not just *what* shipped.

### Where does session data come from?

Claude Code stores session data in `~/.claude/`. AX reads it — it never writes to or modifies your Claude Code data.

Specifically, AX looks at:
- `~/.claude/history.jsonl` — an index of all sessions with timestamps and project paths
- `~/.claude/projects/<encoded-path>/<session-id>.jsonl` — the full conversation for each session

### What does AX extract?

From each session, AX pulls:

| Data | Used for |
|------|----------|
| Human messages (non-commands) | Messages per PR, Iteration Depth |
| Token usage per assistant message | Token Cost per PR |
| Tool calls (Read, Edit, Write, Bash) | Context Efficiency |
| Bash command results (pass/fail) | Self-Correction Rate, Error Recovery |
| `gh pr create` output | Session-to-PR correlation (direct) |
| `git commit` output | Session-to-PR correlation (commit match) |
| `gitBranch` field | Session-to-PR correlation (branch match) |
| Model identifier | Cost computation (model-specific pricing) |

### How does AX know which session goes with which PR?

This is the trickiest part of the system. AX uses a layered correlation strategy, trying the most confident method first:

1. **Direct** — Did the session contain a `gh pr create` command? If so, the PR URL is right there in the output. Bulletproof.
2. **Branch** — Does the session's git branch match a PR's head branch? High confidence, unless you reuse branch names.
3. **Commit** — Do any commit SHAs from the session's `git commit` output appear in a PR? Medium confidence.

If a single session produced multiple PRs (e.g., a long planning session), AX divides the session's metrics evenly across all correlated PRs. A session with 30 messages correlated to 3 PRs counts as 10 messages per PR.

> **Deep dive:** The full correlation algorithm is in [Architecture: Session-to-PR Correlation](architecture.md). The implementation lives in `internal/correlator/correlator.go`.

### What if I don't have session data?

No problem. AX degrades gracefully. Git/GitHub metrics always work. Session metrics show as "—" in reports and as empty cards in the dashboard. As soon as you sync a repo that has Claude Code session data, those metrics light up.

---

## How Metrics Are Calculated

AX computes 16 metrics across four categories. Here's the quick version — each metric links to its full documentation.

### Output Quality

| Metric | Calculation | Docs |
|--------|-------------|------|
| [Post-Open Commits](metrics/post-open-commits.md) | Commits with `committedDate > pr.createdAt` | Count of commits pushed after the PR was opened |
| [First-Pass Acceptance](metrics/first-pass-acceptance-rate.md) | No `CHANGES_REQUESTED` reviews | Binary: was the PR merged without revision requests? |
| [CI Success Rate](metrics/ci-success-rate.md) | Passed checks / total checks | From `statusCheckRollup` in the GitHub API |
| [Test Coverage](metrics/test-coverage-of-generated-code.md) | PR contains `*.test.*`, `*.spec.*`, `__tests__/`, etc. | File pattern matching on the diff |
| [Diff Churn](metrics/diff-churn.md) | Sum of commit additions − net diff additions | Lines written then rewritten before merge |
| [Line Revisit Rate](metrics/line-revisit-rate.md) | Files touched across multiple PRs | Signals code instability or fast iteration |

### Prompt Efficiency

| Metric | Calculation | Docs |
|--------|-------------|------|
| [Messages per PR](metrics/messages-per-pr.md) | Count non-meta, non-command user messages | Your messages, not the agent's |
| [Iteration Depth](metrics/iteration-depth.md) | Count human→assistant turn pairs | Back-and-forth cycles |
| [Token Cost per PR](metrics/token-cost-per-pr.md) | Per-message cost using model-specific pricing | Dollars, not raw token counts |
| [Unmerged Token Spend](metrics/unmerged-token-spend.md) | Cost on closed-not-merged + uncorrelated sessions | Repo-level waste signal |

### Agent Behavior

| Metric | Calculation | Docs |
|--------|-------------|------|
| [Self-Correction Rate](metrics/self-correction-rate.md) | Successful Bash commands / total Bash commands | How often the agent recovers from errors |
| [Context Efficiency](metrics/context-efficiency.md) | Files modified / files read | Is the agent reading before writing? |
| [Error Recovery](metrics/error-recovery-efficiency.md) | Total Bash errors across sessions | Fewer = more efficient |

### Planning Effectiveness *(coming in Phase 3)*

| Metric | Status | Docs |
|--------|--------|------|
| [Plan-to-Implementation Coverage](metrics/plan-to-implementation-coverage.md) | Not yet implemented | How much of the plan made it to code |
| [Plan Deviation Score](metrics/plan-deviation-score.md) | Not yet implemented | Files planned vs files changed |
| [Scope Creep Detection](metrics/scope-creep-detection.md) | Not yet implemented | Changes beyond what was asked |

---

## Troubleshooting

### "not a git repository"

You need to run `ax sync` from inside a git repo, or pass `--repo /path/to/repo`.

### "could not parse GitHub remote"

AX needs a GitHub remote. Check `git remote -v` — it should show a `github.com` URL (HTTPS or SSH).

### "gh pr list failed"

Make sure `gh` is authenticated:

```bash
gh auth status
# If not logged in:
gh auth login
```

### Session metrics show "—"

This means no Claude Code session data was found for the repo, or sessions couldn't be correlated to PRs. Check:

1. Does `~/.claude/projects/` have a directory for your repo?
2. Did you use Claude Code in the repo? Sessions are stored per-project.
3. Were you on a feature branch? Sessions on `main` can't correlate to PRs by branch name — they need commit SHAs or PR URLs.

### CI success rate is 0%

This was a bug we fixed. Make sure you're running the latest `ax` binary (`make build`). The fix normalizes GitHub API status values to handle uppercase `SUCCESS` vs lowercase `success`.

### Database issues

AX stores data in `~/.ax/ax.db`. If things get weird:

```bash
# Check it exists
ls -la ~/.ax/ax.db

# Nuclear option: start fresh
rm ~/.ax/ax.db
ax sync --repo .
```

The database is entirely derived from git + GitHub + session data. Deleting it loses nothing permanent — just re-sync.

---

## What's Next

### Phase 3: Planning metrics

We're building metrics that analyze how well upfront planning translates to implementation. If you use Claude Code's plan mode, these metrics will tell you whether your plans are actually helping.

### Team mode

AX is designed to scale from a single engineer to an entire org. The architecture supports:

- **Claude Code hooks** that automatically push session data to a central server after each session
- **A central ingestion API** for team-wide metric aggregation
- **Org-level dashboards** with team and individual views

This isn't built yet, but the data model and interfaces are designed for it. See [ADR-003: Target Scope](decisions/003-target-scope.md) and [ADR-005: Session Ingestion Strategy](decisions/005-session-ingestion-strategy.md) for the roadmap.

### Contributing

AX is open source. The codebase is deliberately simple:

- Go CLI with no heavy frameworks (just Cobra for CLI, SQLite for storage)
- Parsers shell out to `git` and `gh` — no SDKs to learn
- Metrics are pure functions with comprehensive tests
- Dashboard is vanilla Next.js with server components

Read [Architecture](architecture.md) for a full system walkthrough. Decision records in `docs/decisions/` explain every major choice and link to the alternatives we considered.

---

## Quick Reference

```bash
# Sync a repo
ax sync --repo .

# Sync with a date filter
ax sync --repo . --since 2026-01-01

# Print aggregate metrics
ax report

# Print metrics for a specific PR
ax report --pr 42

# See all tracked repos
ax status

# Start the dashboard
ax dashboard

# Dashboard on a custom port
ax dashboard --port 8080
```

## Where Data Lives

| What | Where |
|------|-------|
| AX database | `~/.ax/ax.db` |
| AX config | `~/.ax/config.json` |
| Claude Code sessions | `~/.claude/projects/<encoded-path>/` |
| Claude Code history | `~/.claude/history.jsonl` |
| AX metric docs | `docs/metrics/` |
| Architecture decisions | `docs/decisions/` |
