# CI Success Rate

## What It Measures

The percentage of commits or pull requests that pass all CI checks (build, test, lint) on the first push. This metric tracks whether agent-generated code compiles, passes tests, and meets linting standards without requiring follow-up fixes.

## Why It Matters

CI failures are one of the most common sources of rework in agentic coding. When the agent produces code that fails CI, the developer must diagnose the failure, prompt the agent to fix it, and push again — adding latency and eroding the productivity gains from using an agent.

A high CI success rate indicates the agent is writing code that integrates correctly with the existing codebase, follows project conventions, and passes the project's quality gates on the first attempt.

## How It's Calculated

1. For each PR, retrieve the status checks or check runs associated with the first commit push (or the head commit at PR creation time).
2. Classify the outcome:
   - **Success:** All required checks passed on the first push.
   - **Failure:** One or more required checks failed on the first push.
3. Calculate the rate across all PRs in the time window.

```
prs = github.list_prs(state="all", time_window=period)

first_push_success_count = 0
for pr in prs:
    first_commit_sha = pr.commits[0].sha  # or head at PR open time
    check_runs = github.list_check_runs(first_commit_sha)

    all_passed = all(
        run.conclusion == "success"
        for run in check_runs
        if run.is_required
    )
    if all_passed:
        first_push_success_count += 1

ci_success_rate = first_push_success_count / len(prs) * 100
```

For a commit-level view, evaluate every push to the PR branch rather than just the first one. The PR-level view (first push only) is recommended as it directly measures the agent's first-pass quality.

## Data Sources Required

- **GitHub Status Checks / Check Runs API** — Check suite results per commit SHA, including conclusion status and whether the check is required.
- **GitHub API** — PR metadata and commit history to identify first-push commits.
