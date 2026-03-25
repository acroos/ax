# Diff Churn

## What It Measures

The amount of code that was written and then rewritten before a PR was merged. Diff churn compares the sum of all individual commit diffs against the net diff of the PR (base to head). The difference represents lines that were added or modified in one commit and then changed again in a subsequent commit — effort that did not survive to the final result.

## Why It Matters

Diff churn is a direct measure of wasted effort. Every line that gets written and then rewritten represents time spent producing code that was ultimately discarded or replaced. In agentic coding, high churn indicates the agent is taking a trial-and-error approach rather than producing correct code on the first attempt.

Reducing diff churn improves both efficiency (less compute, fewer tokens, less developer review time) and code quality (fewer intermediate states that could introduce bugs).

## How It's Calculated

1. Compute the **gross diff**: the sum of lines added and removed across all individual commits in the PR.
2. Compute the **net diff**: the total lines added and removed when comparing the PR's base branch to the final head commit (the merge diff).
3. Diff churn is the difference between gross and net, representing lines that were touched more than once.

```
gross_additions = sum(commit.additions for commit in pr.commits)
gross_deletions = sum(commit.deletions for commit in pr.commits)
gross_total = gross_additions + gross_deletions

net_diff = git.diff(pr.base, pr.head)
net_total = net_diff.additions + net_diff.deletions

diff_churn = gross_total - net_total
```

As a ratio (churn rate):

```
churn_rate = diff_churn / gross_total * 100  # percentage of effort that was rework
```

A churn rate of 0% means every line written survived to the final diff. A churn rate of 50% means half the lines written were subsequently rewritten.

## Interpreting Values

- **Good:** Churn rates below 15% indicate the agent is writing code that sticks. Minor churn is normal — small refactors, typo fixes, and review-driven adjustments are part of any development process.
- **Concerning:** Churn rates above 30-40% suggest significant rework. The agent may be guessing at implementations, fixing bugs iteratively, or making changes that conflict with each other. Investigate whether the agent had sufficient context about the codebase and requirements before starting.
- **Ambiguity:** Some churn is intentional and healthy. Refactoring commits that restructure code (rename a variable across files, extract a function) will show as churn even though they represent deliberate improvement. Squash-merge workflows will show zero churn at the PR level since only the net diff is visible — in that case, analyze individual commits before squashing. Also, very small PRs (1-5 lines net) can show misleadingly high churn rates from a single corrective commit.

## Data Sources Required

- **Git** — Individual commit diffs (additions/deletions per commit) and the base-to-head diff for the PR.
- **GitHub API** — PR metadata to identify base and head refs.

## Phase

**Phase 1** — Uses git history. No session data required.
