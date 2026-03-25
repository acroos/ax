# Test Coverage of Generated Code

## What It Measures

Whether pull requests that modify application code also include changes to test files. This metric checks for the presence of test file modifications (files matching patterns like `*.test.*`, `*.spec.*`, `__tests__/*`, `test/*`) alongside production code changes. It does not measure line-level code coverage, but rather whether tests were written or updated as part of the PR.

## Why It Matters

Tests are the primary safety net for code changes. When an agent generates or modifies production code without updating tests, it creates risk: the new code may not work as expected, and future changes may break it without anyone noticing. Tracking whether PRs include test changes helps ensure the agent is following testing best practices rather than producing untested code.

This metric is particularly important for agentic coding because agents can produce large volumes of code quickly. Without corresponding tests, that code becomes a liability rather than an asset.

## How It's Calculated

1. Retrieve the list of files changed in the PR via `git diff` or the GitHub API.
2. Separate files into two categories:
   - **Test files:** Files matching common test patterns (`*.test.ts`, `*.test.js`, `*.spec.ts`, `*.spec.js`, `__tests__/**`, `test/**`, `tests/**`, `*_test.go`, `test_*.py`, etc.).
   - **Production files:** All other source files, excluding configuration, documentation, and other non-code files.
3. Classify the PR:
   - **Tested:** PR modifies production files AND includes test file changes.
   - **Untested:** PR modifies production files but does NOT include test file changes.
   - **Test-only:** PR only modifies test files (not counted against the rate).
   - **Non-code:** PR only modifies config/docs (excluded from the metric).
4. Calculate the coverage rate.

```
test_patterns = [
    "*.test.*", "*.spec.*",
    "__tests__/**", "test/**", "tests/**",
    "*_test.go", "test_*.py"
]

changed_files = git.diff("--name-only", pr.base, pr.head)
test_files = [f for f in changed_files if matches_any(f, test_patterns)]
prod_files = [f for f in changed_files if is_source_file(f) and f not in test_files]

if prod_files:
    has_tests = len(test_files) > 0
    # PR is "tested" or "untested"

test_coverage_rate = tested_pr_count / (tested_pr_count + untested_pr_count) * 100
```

## Interpreting Values

- **Good:** 70-90% of production-code PRs including test changes indicates a strong testing culture. Not every PR needs new tests (e.g., refactors that don't change behavior, config changes), so 100% is neither expected nor necessary.
- **Concerning:** Below 40% suggests that agent-generated code is routinely untested. This creates compounding risk as the codebase grows. Investigate whether the agent is being prompted to write tests, whether the project has testing conventions the agent can follow, and whether the developer is skipping tests for speed.
- **Ambiguity:** This metric measures presence, not quality. A PR may include test files that are trivial, incomplete, or test the wrong things. Conversely, a PR may not include test changes because existing tests already cover the modified behavior. Consider pairing this metric with actual code coverage data (from CI coverage reports) for a fuller picture. Also, some file types (CSS, configuration, documentation) do not require tests — ensure the classification logic excludes these from the denominator.

## Data Sources Required

- **Git diff** — List of files changed in the PR, with enough path information to match against test file patterns.
- **GitHub API** — Optionally, the PR files endpoint for easier retrieval of changed file paths.

## Phase

**Phase 1** — Uses git diff analysis. No session data required.
