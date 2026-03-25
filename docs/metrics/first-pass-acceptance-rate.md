# First-Pass Acceptance Rate

## What It Measures

The percentage of pull requests that are merged without any reviewer requesting changes. A PR achieves first-pass acceptance if it receives only approvals (or no formal review) and is merged without a "changes requested" review event.

## Why It Matters

First-pass acceptance rate is one of the strongest signals of output quality. When a PR passes review without change requests, it means the implementation met the reviewer's standards on the first attempt. For agentic coding, this metric directly measures whether the agent is producing code that humans find acceptable without requiring revisions.

A high first-pass acceptance rate reduces the overall cycle time for shipping features, since review round-trips are one of the largest sources of delay in the development process.

## How It's Calculated

1. Retrieve all merged PRs in the target time window.
2. For each PR, fetch review events from the GitHub Reviews API.
3. Classify each PR:
   - **First-pass accepted:** No review has `state == "CHANGES_REQUESTED"` before the merge.
   - **Not first-pass accepted:** At least one review has `state == "CHANGES_REQUESTED"` at any point before merge.
4. Calculate the rate.

```
merged_prs = github.list_prs(state="closed", merged=True)

first_pass_count = 0
for pr in merged_prs:
    reviews = github.list_reviews(pr.number)
    has_changes_requested = any(
        review.state == "CHANGES_REQUESTED"
        for review in reviews
    )
    if not has_changes_requested:
        first_pass_count += 1

first_pass_acceptance_rate = first_pass_count / len(merged_prs) * 100
```

## Interpreting Values

- **Good:** 70-90% first-pass acceptance rate indicates the agent is consistently producing review-ready code. Teams with strong planning and prompting practices should aim for the upper end of this range.
- **Concerning:** Below 50% suggests systemic quality issues — the agent may be producing code that does not meet team standards, missing edge cases, or ignoring existing patterns in the codebase. Investigate whether the issue is in the prompting, agent configuration, or codebase complexity.
- **Ambiguity:** This metric is influenced by reviewer behavior. Teams with very strict review cultures will naturally have lower first-pass acceptance rates, even for high-quality code. Conversely, rubber-stamp reviews will inflate the rate. Also, some change requests are stylistic rather than substantive — consider tracking severity of change requests separately if the raw rate is misleading. PRs with no reviews at all should be flagged separately, as they may indicate a process gap rather than high quality.

## Data Sources Required

- **GitHub Reviews API** — Review events for each PR, including review state (`APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`).
- **GitHub API** — PR metadata to identify merged PRs and merge timestamps.

## Phase

**Phase 1** — Uses the GitHub API. No session data required.
