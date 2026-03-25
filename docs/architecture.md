# AX Architecture

This document describes the architecture of AX, a CLI + web dashboard that measures developer experience for agentic coding workflows (specifically Claude Code). It is intended as a reference for contributors.

## System Overview

AX ingests data from three sources -- git history, GitHub PRs, and Claude Code session files -- correlates them, computes metrics, and stores everything in a local SQLite database. A Next.js dashboard reads that database to present visualizations.

```
                           ┌─────────────────────────────────┐
                           │         ax sync --repo .        │
                           └────────────┬────────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            │                           │                           │
            v                           v                           v
   ┌────────────────┐        ┌────────────────────┐      ┌──────────────────┐
   │   GitParser     │        │   GitHubParser      │      │  Session Parser  │
   │  (os/exec git)  │        │   (os/exec gh)      │      │  (~/.claude/)    │
   └───────┬────────┘        └────────┬───────────┘      └────────┬─────────┘
           │                          │                           │
           │  commits, diffs,         │  PRs, reviews,            │  messages, tokens,
           │  branches, files         │  CI checks, commits       │  tool calls, costs
           │                          │                           │
           └───────────┬──────────────┘                           │
                       │                                          │
                       v                                          │
              ┌────────────────┐                                  │
              │ Metric Engines │                                  │
              │ (Phase 1)      │                                  │
              └───────┬────────┘                                  │
                      │                                           │
                      │         ┌──────────────────┐              │
                      │         │    Correlator     │<─────────────┘
                      │         │ session <-> PR    │
                      │         └────────┬─────────┘
                      │                  │
                      │    ┌─────────────┘
                      │    │  session-dependent
                      │    │  metrics (Phase 2)
                      v    v
              ┌────────────────┐
              │    SQLite DB    │
              │  (~/.ax/ax.db)  │
              └───────┬────────┘
                      │
           ┌──────────┴──────────┐
           │                     │
           v                     v
   ┌───────────────┐    ┌───────────────────┐
   │  ax report     │    │  Next.js Dashboard │
   │  (CLI output)  │    │  (better-sqlite3)  │
   └───────────────┘    └───────────────────┘
```

## Components

### CLI (`cmd/ax/`)

The CLI is a Go binary built with Cobra. It provides three primary commands:

- **`ax sync --repo .`** -- Ingest git, GitHub, and session data for a repository, compute all metrics, and store results.
- **`ax report`** -- Print aggregate metrics or per-PR metrics to the terminal.
- **`ax status`** -- Show tracked repos and their last sync time.

The CLI shells out to `git` and `gh` via `os/exec`. There are no SDK dependencies for GitHub or git -- this keeps the binary small and leverages the user's existing authentication.

### Parsers (`internal/parsers/`)

Parsers extract raw data from external sources. Each parser is a struct with methods that execute CLI commands and parse their output.

**GitParser** (`git.go`):
- Wraps the `git` CLI, running commands in the repository directory.
- Extracts: commits (with numstat), diffs between refs, files changed per commit, remote URL, default branch, repo root.
- Parses GitHub remote URLs (SSH and HTTPS) to extract owner/repo.

**GitHubParser** (`github.go`):
- Wraps the `gh` CLI with the `-R owner/repo` flag.
- Extracts: PR list with metadata (state, dates, additions/deletions), reviews, commits per PR, CI check results (via `statusCheckRollup`).
- All data comes back as JSON from `gh`, parsed into Go structs.

**Session Parser** (`claude_sessions.go`):
- Reads Claude Code session files from `~/.claude/projects/<encoded-path>/*.jsonl`.
- Each JSONL file is one session. The parser streams lines and aggregates:
  - Message counts (human, assistant), turn count (human-then-assistant pairs).
  - Token usage per assistant message (input, output, cache read, cache creation).
  - Dollar cost per message via the pricing engine.
  - Tool call counts by tool name (Bash, Read, Edit, Write, Glob).
  - Files read and modified (extracted from tool call inputs).
  - PR URLs (from `gh pr create` output) and commit SHAs (from `git commit` output).
  - Bash error/success counts (from tool result `is_error` flags).
  - Git branch (last seen `gitBranch` field).
- Deduplicates assistant messages by message ID to avoid double-counting retries.

### Correlator (`internal/correlator/`)

Links Claude Code sessions to GitHub PRs. This is critical because Claude Code does not natively record which PR a session contributes to. See the dedicated section below for the correlation strategy.

### Metrics (`internal/metrics/`)

Metric calculators are pure functions that take parsed data and return a metric value. They are stateless and testable in isolation. Metrics are organized by phase:

**Phase 1 (git/GitHub only):**
- Post-open commits -- commits pushed after PR was opened.
- First-pass acceptance -- whether the PR was approved without changes requested.
- CI success rate -- fraction of CI checks that passed.
- Test coverage -- whether the PR includes test files.
- Diff churn -- total lines added across commits minus net lines added (measures rework).
- Line revisit rate -- how often files from one PR are modified again in other PRs.

**Phase 2 (session-dependent):**
- Messages per PR -- human messages in correlated sessions (weighted when a session spans multiple PRs).
- Iteration depth -- turn count (human/assistant pairs).
- Self-correction rate -- ratio of errors to total bash commands.
- Context efficiency -- derived from token usage patterns.
- Error recovery attempts -- bash errors encountered.
- Token cost per PR -- dollar cost from the pricing engine.

### Pricing (`internal/pricing/`)

Computes dollar costs from Claude API token usage. Contains a hardcoded pricing table for all Claude models (Opus, Sonnet, Haiku across versions 3.5, 4, 4.5, 4.6). The table includes four token types:

| Token type | Example (Sonnet) |
|---|---|
| Input | $3.00 / MTok |
| Output | $15.00 / MTok |
| Cache read | $0.30 / MTok |
| Cache creation | $3.75 / MTok |

Model lookup uses exact match, then prefix match (for versioned IDs like `claude-sonnet-4-6-20260101`), then family match (for aliases containing "opus" or "haiku"). Unknown models fall back to Sonnet pricing. A `PricingVersion` constant tracks when the table was last updated so historical data can be recomputed if prices change.

### Sync Orchestrator (`internal/sync/`)

`sync.Run()` is the main entry point. It coordinates all other components in a single pass. See the data flow section below.

### Database (`internal/db/`)

SQLite database at `~/.ax/ax.db` using the `modernc.org/sqlite` pure-Go driver (no CGO). Opened with WAL mode, 5-second busy timeout, and foreign keys enabled. Schema is managed by an append-only migration system. See the schema section below.

### Dashboard (`dashboard/`)

A Next.js application that reads the same SQLite database the CLI writes to. See the dashboard section below.

## Data Flow: How `ax sync` Works

The `sync.Run()` function performs these steps in order:

**Step 1 -- Resolve repository identity.**
The GitParser finds the repo root (`git rev-parse --show-toplevel`), reads the remote URL, and extracts the GitHub owner/repo from it.

**Step 2 -- Upsert repo in database.**
Creates or updates the `repos` row with the path, remote URL, and GitHub coordinates.

**Step 3 -- Fetch PRs from GitHub.**
Calls `gh pr list --state all --limit 100` to get all PRs with metadata (title, branch, state, dates, additions/deletions/changed files). Also determines the default branch.

**Step 4 -- Parse Claude Code sessions.**
Finds session JSONL files in `~/.claude/projects/<encoded-repo-path>/`. Each file is parsed into a `ParsedSession` with message counts, token usage, tool calls, extracted PR URLs/commit SHAs, and cost. Sessions are stored in the `sessions` table.

**Step 5 -- Process each PR.**
For every PR from step 3:
1. Upsert the PR in the `prs` table.
2. Fetch PR commits via `gh pr view --json commits`.
3. Compute Phase 1 metrics:
   - Post-open commits: count commits with `committedDate` after `createdAt`.
   - First-pass acceptance: check if any review has state `CHANGES_REQUESTED`.
   - CI success rate: ratio of passed/skipped/neutral checks to total completed checks.
   - Test coverage: check if any files in the PR match test file patterns.
   - Diff churn: compare cumulative additions across branch commits vs. net additions in the final diff.
4. Store commits in the `commits` table, flagging Claude-authored commits (by `Co-Authored-By` trailer) and post-open commits.
5. Write Phase 1 metrics to `pr_metrics`.

**Step 6 -- Correlate sessions to PRs.**
The correlator runs all parsed sessions against all PRs (see correlation strategy below). Results are stored in the `session_prs` junction table with a confidence level. When a session maps to N PRs, its metrics are divided by N so each PR gets a proportional share.

Session-dependent metrics (messages per PR, iteration depth, self-correction rate, context efficiency, error recovery, token cost) are computed and written to `pr_metrics`.

**Step 7 -- Line revisit rates.**
Cross-PR analysis: find files modified in multiple PRs and compute how often lines are revisited. Update `pr_metrics.line_revisit_rate`.

**Step 8 -- Update sync timestamp.**
Record `last_synced_at` on the repo so `ax status` can display it.

## Session-to-PR Correlation Strategy

The correlator uses a layered approach, trying strategies in order of decreasing confidence. Once a PR is matched by a higher-confidence strategy, it is not re-matched by lower ones.

### Layer 1: Direct (highest confidence)

The session parser extracts PR URLs from `gh pr create` tool output. If a session's output contains a URL that matches a PR's URL, that is a direct correlation. This is the most reliable signal because it means the session literally created the PR.

### Layer 2: Branch

If the session's last-seen `gitBranch` field matches a PR's `headRefName`, they are correlated. Branch names are excluded for `main` and `master` to avoid false positives. This works well for the common workflow where a developer creates a feature branch and works on it in a single session.

### Layer 3: Commit SHA

The session parser extracts short commit SHAs from `git commit` tool output. These are prefix-matched against the full SHAs in each PR's commit list. This catches cases where a session contributed commits to a PR but was on a different branch name or the branch was renamed.

### Layer 4: Heuristic (not yet implemented)

A future layer for timestamp-window overlap: if a session's time range overlaps with a PR's active period and no other correlation was found. This is the least reliable and exists as a fallback.

### Multi-PR Sessions

A single session can correlate to multiple PRs (e.g., a session that works on two features). When this happens, session-level metrics are divided evenly across the correlated PRs using a `1/N` weight. This prevents double-counting token costs or message counts.

### Confidence Storage

Each correlation is stored in `session_prs` with a `confidence` field (`"direct"`, `"branch"`, `"commit"`, or `"heuristic"`). This allows downstream consumers to filter by confidence level or weight metrics accordingly.

## Database Schema Overview

The schema is managed by sequential migrations in `internal/db/db.go`. All migrations run in transactions and are tracked in a `schema_migrations` table.

### Tables

**`repos`** -- Tracked repositories.
- `id`, `path` (unique, absolute filesystem path), `remote_url`, `github_owner`, `github_repo`, `last_synced_at`, `created_at`.

**`sessions`** -- Claude Code sessions.
- `id` (text PK, session UUID), `repo_id` (FK), `branch`, `started_at`/`ended_at` (unix ms), `message_count`, `turn_count`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `total_cost_usd`, `primary_model`.

**`prs`** -- GitHub pull requests.
- `id`, `repo_id` (FK), `number` (unique per repo), `title`, `branch`, `state`, `created_at`/`merged_at`/`closed_at`, `url`, `additions`, `deletions`, `changed_files`.

**`commits`** -- Git commits associated with PRs.
- `sha` (PK), `repo_id` (FK), `pr_id` (FK), `session_id` (FK), `message`, `author`, `committed_at`, `is_claude_authored`, `is_post_open`, `additions`, `deletions`, `files_changed`.

**`session_prs`** -- Junction table linking sessions to PRs.
- `session_id` (FK), `pr_id` (FK), `confidence` (text: direct/branch/commit/heuristic). Composite PK on `(session_id, pr_id)`.

**`pr_metrics`** -- Computed metrics per PR.
- `pr_id` (PK, FK), all 12+ metric columns (nullable), `computed_at`. This is the main table the dashboard reads.

**`plan_analyses`** -- Phase 3 plan-to-implementation analysis (future).
- `pr_id` (FK), `plan_file`, `coverage_score`, `deviation_score`, `scope_creep_detected`, `planned_files`, `actual_files`, `analysis_json`.

**`repo_metrics`** -- Aggregate metrics per time period.
- `repo_id` (FK), `period_start`/`period_end`, `period_type`, token/cost totals, unmerged token spend, `unmerged_rate`.

### Indexes

- `idx_commits_repo`, `idx_commits_pr` -- commit lookups by repo and PR.
- `idx_prs_repo` -- PR lookups by repo.
- `idx_sessions_repo` -- session lookups by repo.
- `idx_repo_metrics_repo` -- aggregate metric lookups.

## Dashboard Architecture

The dashboard is a Next.js application in `dashboard/`.

### Data Access

The dashboard opens the same `~/.ax/ax.db` file as the CLI, in **read-only mode**, using the `better-sqlite3` npm package. The database path can be overridden via the `AX_DB_PATH` environment variable. A singleton connection is lazily initialized with WAL pragma.

The data layer (`dashboard/src/lib/db.ts`) provides typed query functions:
- `listRepos()` -- all tracked repositories.
- `getRepo(id)` -- single repo by ID.
- `listPRsWithMetrics(repoId?)` -- PRs joined with their metrics and repo metadata. Returns a structured `PRWithMetrics` object that nests metrics under a `.metrics` property.
- `getAggregateMetrics(repoId?)` -- computed aggregates across all PRs: averages for post-open commits, messages per PR, iteration depth, token cost, self-correction rate, context efficiency; rates for first-pass acceptance, CI success, and test coverage.

### Rendering

The dashboard uses Next.js server components that call database functions directly -- no API layer. This is possible because `better-sqlite3` is synchronous and runs server-side. The result is a zero-latency data path from SQLite to rendered HTML.

### Packaging

Per [ADR-007](decisions/007-dashboard-packaging.md), the dashboard is embedded into the Go binary as a static build via `go:embed` for end users. Contributors run `npm run dev` for hot-reloading during development.

### Design Philosophy

Per [ADR-006](decisions/006-ux-philosophy.md), the dashboard follows a Linear-inspired, dark-mode-first design with inline metric context. Each metric includes documentation explaining what it measures and how to interpret values.

## Key Design Decisions and Trade-offs

### No SDK dependencies for git/GitHub

Parsers shell out to `git` and `gh` via `os/exec`. This means:
- **Pro:** No OAuth setup, no API token management. Users' existing `gh auth` is reused.
- **Pro:** Smaller binary, fewer transitive dependencies.
- **Con:** Requires `git` and `gh` to be installed and authenticated.
- **Con:** Output parsing is fragile compared to a typed SDK. Mitigated by using `--json` output from `gh`.

### Local-first SQLite

All data lives in a single `~/.ax/ax.db` file.
- **Pro:** Zero infrastructure, no server, instant setup, works offline.
- **Pro:** The CLI and dashboard share the same file -- no sync protocol needed.
- **Con:** Single-user only. Team use requires a different approach (see future architecture).
- **Con:** Concurrent write safety depends on WAL mode and busy timeouts.

### Pure-Go SQLite driver

Uses `modernc.org/sqlite` (a C-to-Go transpilation of SQLite) instead of CGO-based `mattn/go-sqlite3`.
- **Pro:** Cross-compilation works without a C compiler. Simpler CI and distribution.
- **Con:** Slightly slower than the CGO version. Acceptable for AX's workload.

### Append-only migrations

Schema changes are appended as new entries in the `migrations` slice. No down-migrations.
- **Pro:** Simple, predictable, no migration conflicts.
- **Con:** No automated rollback. Acceptable for a local database that can be rebuilt with `ax sync`.

### Proportional session metrics

When a session maps to multiple PRs, metrics are divided by N. This is a simplification -- in reality, a session might spend 90% of effort on one PR and 10% on another. The equal-split approach was chosen because accurately splitting effort would require per-message correlation, which is significantly more complex.

### Confidence-layered correlation

The correlator tries four strategies in confidence order rather than using a scoring/ranking system. This makes the correlation deterministic and debuggable -- you can see exactly which strategy matched. The trade-off is that a lower-confidence match might be more accurate in edge cases, but the layered approach is correct for the vast majority of real workflows.

## Future Architecture

AX is designed to evolve from local-only to team to managed service, per [ADR-003](decisions/003-target-scope.md).

### Phase 3: Plan Analysis

Plan-to-implementation metrics will analyze Claude Code plan files to measure coverage (did the implementation match the plan?), deviation (how much did it drift?), and scope creep (did the scope grow?). The `plan_analyses` table and `pr_metrics` columns are already in the schema.

### Team Layer

For team use, AX will introduce:
- **`ax push`** -- Push session data to a shared store (without requiring everyone to have local session files).
- **Claude Code hooks** ([ADR-005](decisions/005-session-ingestion-strategy.md)) -- Automatically capture session data at the point of creation, rather than retrospectively parsing files.
- A server component that aggregates data across team members.

### Managed Service

The long-term vision is a hosted service that:
- Receives session data via hooks or push.
- Stores data in a managed database (PostgreSQL or similar).
- Provides a hosted dashboard with team-level views.
- The same metric computation engine runs server-side, ensuring consistency between local and hosted modes.

### Distribution

Per [ADR-008](decisions/008-distribution-strategy.md), the CLI is distributed via Homebrew tap and GoReleaser, with the dashboard embedded in the binary.
