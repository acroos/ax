# Data Collection & Privacy

AX collects data about your Claude Code sessions and GitHub pull requests to compute developer experience metrics. This page describes exactly what is collected, what is sent to the server, and what is not.

## What the CLI reads locally

The AX CLI reads these files on your machine:

- **Claude Code session files** — `~/.claude/projects/<path>/*.jsonl` — parsed for metadata (token counts, tool usage, timestamps), never for conversation content
- **Claude Code history** — `~/.claude/history.jsonl` — used by `ax push --all` to discover which repos have session data
- **Git remote URL** — from `.git/config` via `git remote get-url origin` — used to identify the repository

## What is sent to the server

When `ax push` runs (manually or via the automatic SessionEnd hook), it sends **aggregated counts and metadata only**:

### Session data
| Field | Description |
|-------|-------------|
| Session ID | UUID identifying the session |
| Branch name | Git branch active during the session |
| Start / end timestamps | When the session began and ended |
| Message count | Total number of human + assistant messages |
| Turn count | Number of human turns |
| Input / output tokens | Token counts across all messages |
| Cache tokens | Prompt cache creation and read token counts |
| Total cost (USD) | Computed locally using public model pricing |
| Primary model | Model used in the majority of messages |
| Bash errors / successes | Count of failed and successful bash commands |
| Files read count | **Count only** — not file names or paths |
| Files modified count | **Count only** — not file names or paths |

### Commit data
Commits detected in session output:

| Field | Description |
|-------|-------------|
| SHA | Commit hash |
| Message | Commit message text |
| Author | Commit author |
| Timestamp | When the commit was made |
| Claude-authored flag | True if "Co-Authored-By: Claude" appears in the message |
| Additions / deletions | Line count stats |
| Files changed | Count of files changed |

### Pull request references
PR metadata detected from session output or matched by branch:

| Field | Description |
|-------|-------------|
| PR number | GitHub PR number |
| Title, branch, state | Basic PR metadata |
| Timestamps | Created, merged, and closed times |
| URL | GitHub PR URL |
| Additions / deletions | Line count stats |

### Computed metrics
Pre-computed metric values for each PR (messages per PR, token cost, self-correction rate, etc.). These are derived entirely from the data above — see the [metric docs](/docs) for what each one measures.

## What GitHub webhooks provide

If you install the AX GitHub App on your repositories, the server receives webhook events for:

- **Pull request events** — PR number, title, branch, state, author, line count stats, timestamps
- **Pull request reviews** — Review state (approved, changes requested) — used to compute first-pass acceptance rate
- **Check suite results** — CI pass/fail status — used to compute CI success rate
- **Files changed in a PR** — File names, per-file additions/deletions, and status (added, modified, removed) — fetched via the GitHub API when a PR is merged or closed

## What is NOT collected

AX does **not** collect, transmit, or store:

- **Conversation content** — The text of your messages to Claude and Claude's responses are never read, sent, or stored
- **Code or file contents** — No source code leaves your machine via AX; file contents are never read or transmitted
- **File names or paths from sessions** — Only counts (files read: 12, files modified: 3) are sent, not which files
- **Bash command content or output** — Only success/failure counts; the CLI scans output locally for PR URLs and commit SHAs but does not transmit the output itself
- **Plan content** — Plan files are detected locally for metric computation but their text is not sent
- **Diff content** — Only summary statistics (total additions/deletions); line-by-line diff content is not stored

## Where data is stored

- **Server database** — PostgreSQL on Railway, accessible only to the AX service
- **GitHub data** — PR metadata and file lists from webhooks/API are stored alongside session data to compute metrics
- **No third-party analytics or tracking** — AX does not send your data to any third-party service

## Data scope by component

| Data source | What AX sees | What AX does NOT see |
|-------------|-------------|---------------------|
| Claude Code sessions | Token counts, cost, tool usage counts, timestamps, branch | Conversation text, code, file names, command output |
| Git | Remote URL, branch names, commit metadata | Uncommitted changes, local branches not in sessions |
| GitHub webhooks | PR metadata, review states, CI results, file names changed | Code diffs, PR comments, issue content |

## Open source

AX is [open source](https://github.com/acroos/ax). You can audit exactly what the CLI sends by reading the session parser at `internal/parsers/claude_sessions.go` and the push payload definition at `internal/api/types.go`.
