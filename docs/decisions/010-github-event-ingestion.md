# ADR-010: GitHub Event Ingestion & Metric Lifecycle

## Status
Accepted

## Date
2026-03-25

## Context
AX only learned about GitHub PR state changes (merges, reviews, CI completions) as a side effect of Claude Code session hooks triggering `ax sync`. If a PR was merged without a Claude session ending afterward, the data went stale. Additionally, metrics were computed for all PRs regardless of state, meaning open PRs with pending reviews and running CI created noise in reports and the dashboard.

## Decision

### 1. Metric Lifecycle: Terminal-Only Computation
Metrics are only computed and finalized when PRs reach terminal states (merged or closed). Open PRs are excluded from reports and the dashboard entirely.

- `pr_metrics.metrics_finalized` flag prevents recomputation of finalized PRs
- `prs.previous_state` tracks state transitions for change detection
- `UpsertPRMetrics` is a no-op for already-finalized PRs

### 2. `ax watch` Poller for GitHub State Detection
A new `ax watch` command polls `gh pr list` to detect PR state transitions:

- `ax watch` — foreground polling loop
- `ax watch --once` — single poll cycle (for scheduled execution)
- `ax watch install` — installs launchd (macOS) or cron (Linux) job
- `ax watch uninstall` — removes the scheduled job

### 3. Three Complementary Sync Paths

| Trigger | Function | Scope |
|---------|----------|-------|
| Claude session ends | `Run` (full) | PRs + sessions + correlation + finalization |
| Claude response (--live) | `RunSessionsOnly` | Sessions + session-dependent metrics only |
| `ax watch` poll | `RunGitHubOnly` | PR state changes + finalization + repo metrics |

### 4. `ax init` Installs Everything
`ax init` now installs both Claude Code hooks AND background polling by default. Use `--no-watch` to opt out.

## Alternatives Considered

- **GitHub webhooks**: Requires a publicly accessible server. AX is a local CLI tool with no hosted server, so traditional webhooks don't work without tunneling or a hosted relay. Designed as a future evolution (platform-agnostic event service).
- **GitHub Actions workflow**: Runs in CI, not on the user's machine. Cannot write to `~/.ax/ax.db`.
- **Git hooks (post-merge, post-checkout)**: Only catches local git operations. Misses PR merges done via GitHub UI, reviews, and CI completions.

## Consequences

**Easier:**
- Metrics accurately reflect completed work, not in-flight noise
- PR state changes are detected within 5 minutes regardless of Claude sessions
- Single `ax init` command sets up complete automation

**Harder:**
- Users need `gh` CLI authenticated for polling to work
- Polling adds a small periodic load (one `gh pr list` call per repo per interval)
- Future webhook-based real-time updates require a hosted service (designed for but not yet built)

**Future path:**
The metric lifecycle model (finalization on terminal state) is trigger-agnostic. When a hosted event service is built to receive webhooks from GitHub/GitLab/Jira/Linear, it will use the same `FinalizePR` logic — only the trigger mechanism changes.
