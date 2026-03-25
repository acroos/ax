# Scope Creep Detection

## What It Measures

Changes in a PR that go beyond what was originally planned or asked for. This metric identifies files changed in the PR that were not mentioned in the plan, excluding obvious support files (lock files, generated code, configuration updates). It flags unplanned work that may represent scope creep — the agent doing more than what was requested.

## Why It Matters

Scope creep in agentic coding is a subtle but significant problem. An agent that "helpfully" refactors unrelated code, adds unrequested features, or touches files outside the planned scope can introduce bugs, create merge conflicts, and make PRs harder to review. Unlike human developers who consciously decide to expand scope, agents may drift without awareness of the consequences.

Detecting scope creep helps teams enforce discipline in their agentic workflows. When the metric flags unplanned changes, the developer can assess whether the changes were necessary (a dependency the plan missed) or truly out of scope (the agent going rogue).

## How It's Calculated

1. Extract the set of files referenced in the plan.
2. Extract the set of files changed in the PR.
3. Identify files changed but not planned (the difference set).
4. Filter out expected support files that do not represent meaningful scope creep.
5. The remaining unplanned files are flagged as potential scope creep.

```
planned_files = parse_plan_files(plan_file)
changed_files = git.diff("--name-only", pr.base, pr.head)

# Files commonly changed as side effects, not scope creep
support_file_patterns = [
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "*.generated.*", "*.d.ts",
    ".eslintrc*", "tsconfig*.json",
    "*.snap"  # test snapshots
]

unplanned_files = changed_files - planned_files
scope_creep_files = [
    f for f in unplanned_files
    if not matches_any(f, support_file_patterns)
]

scope_creep_count = len(scope_creep_files)
scope_creep_rate = scope_creep_count / len(changed_files) * 100
```

The metric can be reported as:
- **Count:** Number of files changed outside the plan.
- **Rate:** Percentage of changed files that were not in the plan.
- **List:** The specific files flagged, for developer review.

## Interpreting Values

- **Good:** Scope creep rate below 10-15% is healthy. A few unplanned files are normal — the agent may have discovered a necessary dependency or import that the plan did not anticipate.
- **Concerning:** Scope creep rates above 30% warrant investigation. The agent may be making changes the developer did not ask for, which increases review burden and risk. Look at the specific files flagged — are they in unrelated directories? Do they represent unrequested features or refactors?
- **Ambiguity:** Not all unplanned changes are bad. The plan may have genuinely missed a required file (a type definition, a shared utility, a test fixture). Scope creep detection is a flagging mechanism, not a judgment — it tells you where to look, and the developer decides whether the change was appropriate. Also, if plans are intentionally high-level, many legitimate support file changes will show up as "unplanned." Calibrate the support file exclusion list to match your project's norms.

## Data Sources Required

- **Plan files** — Documents listing the expected files to modify.
- **Git diff** — The list of files actually changed in the PR.
- **Support file patterns** — A configurable list of file patterns to exclude from scope creep detection.

## Phase

**Phase 3** — Requires plan file ingestion and a structured planning workflow.
