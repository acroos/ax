# Post-Open Commits

## What It Measures

The number of commits pushed to a PR branch after the pull request was opened. This counts all commits with timestamps after the PR's `created_at` timestamp, excluding the initial commit(s) that formed the basis of the PR.

## Why It Matters

Post-open commits are a signal of rework. When a PR is opened, the author is signaling that the work is ready for review. Commits after that point typically represent fixes for review feedback, CI failures, or issues the author discovered after opening. A high post-open commit count suggests the work was not truly ready when the PR was opened.

For agentic coding, this metric helps evaluate whether the agent is producing complete, review-ready work on the first pass or whether significant follow-up effort is needed after the PR enters the review cycle.

## How It's Calculated

1. Retrieve the PR's `created_at` timestamp from the GitHub API.
2. List all commits on the PR branch (via the GitHub Pull Requests API or by comparing the branch against the base).
3. Count commits whose `committer.date` or `author.date` is after the PR's `created_at` timestamp.
4. Optionally exclude merge commits or bot-authored commits (e.g., auto-formatters, dependency bots) to focus on substantive changes.

```
pr_opened_at = github.get_pr(pr_number).created_at

post_open_commits = count(
    commit for commit in pr.commits
    if commit.date > pr_opened_at
    and not commit.is_merge_commit
)
```

## Interpreting Values

- **Good:** Zero post-open commits is ideal — the PR was complete when opened. One or two post-open commits are common and acceptable, often representing minor review feedback or small CI fixes.
- **Concerning:** Three or more post-open commits suggest the PR was opened prematurely or that the initial implementation had significant gaps. Consistently high counts may indicate the agent is not running tests or linters before the developer opens the PR, or that the developer is opening PRs too early in the process.
- **Ambiguity:** Some teams use a "draft PR" workflow where the PR is opened early for visibility and iterated on. In this case, post-open commits are expected and the metric is less meaningful. Consider filtering out draft PRs or measuring from the "ready for review" event instead. Also, post-open commits driven by changing requirements (not quality issues) should be interpreted differently.

## Data Sources Required

- **GitHub API** — Pull request metadata (`created_at`, `draft` status) and commit list with timestamps.
- **Git** — Commit history on the PR branch for timestamp comparison.

## Phase

**Phase 1** — Uses git history and the GitHub API. No session data required.
