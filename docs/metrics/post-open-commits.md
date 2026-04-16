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

## Data Sources Required

- **GitHub API** — Pull request metadata (`created_at`, `draft` status) and commit list with timestamps.
- **Git** — Commit history on the PR branch for timestamp comparison.
