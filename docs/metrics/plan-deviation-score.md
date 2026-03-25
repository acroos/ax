# Plan Deviation Score

## What It Measures

The difference between the set of files listed in a plan and the set of files actually changed in the PR. Plan deviation score quantifies how accurately the plan predicted which files would be modified, using set intersection and difference to compute the overlap.

## Why It Matters

File-level deviation is one of the easiest and most objective ways to assess plan accuracy. If a plan says "modify files A, B, and C" but the PR changes files A, C, D, and E, the plan missed two files and included one that was not changed. This discrepancy reveals gaps in understanding, missed dependencies, or scope changes that occurred during implementation.

For teams using plans as agent input, reducing plan deviation improves agent focus — the agent spends less time exploring files it should not touch and is less likely to miss files it should modify.

## How It's Calculated

1. Extract the set of files referenced in the plan document.
2. Extract the set of files changed in the PR diff.
3. Compute the set operations:
   - **Planned and changed (intersection):** Files the plan correctly predicted.
   - **Planned but not changed (plan-only):** Files the plan listed but that were not modified. Indicates over-planning or abandoned approaches.
   - **Changed but not planned (impl-only):** Files that were modified but not mentioned in the plan. Indicates gaps in the plan or unexpected dependencies.

```
planned_files = parse_plan_files(plan_file)
changed_files = git.diff("--name-only", pr.base, pr.head)

intersection = planned_files & changed_files
plan_only = planned_files - changed_files
impl_only = changed_files - planned_files

# Jaccard similarity (0 to 1, where 1 = perfect alignment)
deviation_score = 1 - len(intersection) / len(planned_files | changed_files)

# Or as individual rates:
precision = len(intersection) / len(planned_files)  # how much of the plan was used
recall = len(intersection) / len(changed_files)      # how much of the impl was planned
```

A deviation score of 0 means perfect alignment. A score approaching 1 means almost no overlap between planned and actual files.

## Interpreting Values

- **Good:** Deviation scores below 0.2 (or precision and recall both above 80%) indicate strong plan accuracy. The plan correctly anticipated most of the files that would change, with few surprises.
- **Concerning:** Deviation scores above 0.5 suggest the plan and implementation are substantially different. Either the plan was written without sufficient understanding of the codebase, or the task evolved significantly during implementation. Consistently high deviation warrants a review of the planning process.
- **Ambiguity:** Some file changes are inherently unpredictable — lock files, generated types, configuration files that need updating when dependencies change. Consider maintaining an exclusion list of files that are not expected to appear in plans (e.g., `package-lock.json`, `*.generated.ts`, `.eslintrc`). Also, plans for large features may intentionally omit low-level detail, leading to higher deviation scores that do not indicate a planning failure.

## Data Sources Required

- **Plan files** — Documents listing the files expected to be modified, in a parseable format.
- **Git diff** — The `--name-only` diff of the PR to get the actual set of changed files.

## Phase

**Phase 3** — Requires plan file ingestion and a structured planning workflow.
