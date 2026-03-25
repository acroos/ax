# Plan-to-Implementation Coverage

## What It Measures

How much of the final implementation was anticipated and captured in the plan document. This metric compares the content of a plan file (written before implementation) against the actual diff produced by the PR, measuring the overlap between what was planned and what was built.

## Why It Matters

Planning is only valuable if it accurately predicts the work to be done. Plan-to-implementation coverage measures the predictive quality of plans. High coverage means the plan successfully captured the scope and nature of the changes. Low coverage means the implementation diverged significantly from the plan — either because the plan was incomplete, wrong, or the task evolved during implementation.

For agentic coding workflows that use plans as input to the agent, this metric directly measures whether the planning step is adding value. If plans consistently fail to predict what gets built, the planning effort may need to be restructured.

## How It's Calculated

1. Parse the plan file to extract planned changes. Plans may reference:
   - Specific files to modify or create
   - Functions, classes, or components to add or change
   - Architectural decisions or patterns to follow
   - Acceptance criteria or requirements
2. Analyze the actual PR diff to identify what was implemented.
3. Compute coverage as the proportion of implementation elements that were referenced in the plan.

```
plan_elements = parse_plan(plan_file)  # files, functions, components, requirements
impl_elements = analyze_diff(pr.diff)  # files changed, functions modified, etc.

covered = impl_elements.intersection(plan_elements)
coverage = len(covered) / len(impl_elements) * 100
```

Coverage can be computed at multiple levels of granularity:
- **File-level:** Were the changed files mentioned in the plan?
- **Component-level:** Were the modified components/modules anticipated?
- **Requirement-level:** Does the diff satisfy the plan's stated requirements?

File-level coverage is the simplest and most automatable. Component and requirement-level coverage may require NLP or manual assessment.

## Interpreting Values

- **Good:** 70-90% coverage indicates the plan was a reliable guide for implementation. Some deviation is expected — developers and agents discover edge cases, dependencies, and better approaches during implementation.
- **Concerning:** Below 40% suggests the plan did not meaningfully predict the implementation. This may mean plans are too vague, written too early, or not updated as understanding evolves. It may also indicate the agent is ignoring the plan and going its own direction.
- **Ambiguity:** 100% coverage is not necessarily the goal. Plans that are overly prescriptive may prevent the agent from finding better solutions. Also, some implementation details (import changes, type adjustments, configuration updates) are too granular to include in a plan and should not be penalized. Consider excluding boilerplate/support files from the denominator.

## Data Sources Required

- **Plan files** — Structured or semi-structured documents written before implementation, with references to files, components, or requirements.
- **Git diff** — The actual changes made in the PR, including file paths and content changes.
- **Plan file format specification** — A defined format for plan files so they can be parsed programmatically.

## Phase

**Phase 3** — Requires plan file ingestion and a structured planning workflow.
