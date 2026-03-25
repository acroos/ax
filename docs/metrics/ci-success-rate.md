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

## Interpreting Values

- **Good:** 80-95% CI success rate on first push indicates the agent is reliably producing code that integrates with the project's build and test infrastructure. Perfection (100%) is unlikely due to flaky tests and environment issues, but consistently high rates are achievable.
- **Concerning:** Below 60% suggests the agent is not accounting for CI requirements — it may be skipping tests, introducing type errors, or violating lint rules. Investigate whether the agent has access to the project's CI configuration and whether the developer's prompts include instructions to run checks before committing.
- **Ambiguity:** Flaky tests inflate failure rates without reflecting agent quality. If the project has known flaky tests, consider excluding them or tracking a "flaky-adjusted" CI success rate. Also, some CI checks (e.g., deployment previews, performance benchmarks) may fail for reasons unrelated to code quality — filter to required/core checks only.

## Data Sources Required

- **GitHub Status Checks / Check Runs API** — Check suite results per commit SHA, including conclusion status and whether the check is required.
- **GitHub API** — PR metadata and commit history to identify first-push commits.

## Phase

**Phase 1** — Uses the GitHub API. No session data required.
