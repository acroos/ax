# Line Revisit Rate

## What It Measures

How often the same lines of code are modified across different pull requests. This metric tracks whether code written in one PR is subsequently changed in a later PR, indicating instability in that region of the codebase. It uses git blame and diff analysis to identify lines that were recently written and then modified again shortly after.

## Why It Matters

When lines of code are revisited frequently, it suggests one of several problems: the original implementation had quality issues, requirements changed after the code was written, or the area of the codebase is undergoing rapid iteration. For agentic coding, a high line revisit rate can indicate the agent is producing code that does not hold up — it works initially but needs to be fixed or replaced soon after.

Tracking this metric over time helps teams identify areas of the codebase that are unstable and may need more careful attention, better test coverage, or clearer requirements before being handed to an agent.

## How It's Calculated

1. For a given PR, retrieve the list of lines modified (added or changed) using `git diff`.
2. For each modified line, use `git blame` on the parent commit to determine when that line was last written.
3. If the line was written within a recent window (e.g., the last N PRs or the last M days), it counts as a "revisit."
4. Calculate the revisit rate as the proportion of modified lines that were recently written.

```
recent_window_days = 14  # configurable

modified_lines = git.diff(pr.base, pr.head, unified=0)

revisit_count = 0
total_modified = 0

for file, line_number in modified_lines:
    blame_info = git.blame(file, line_number, ref=pr.base)
    if blame_info.commit_date > (pr.created_at - timedelta(days=recent_window_days)):
        revisit_count += 1
    total_modified += 1

line_revisit_rate = revisit_count / total_modified * 100
```

Can also be calculated at a file level (files modified in multiple recent PRs) for a less granular but faster analysis.

## Interpreting Values

- **Good:** Revisit rates below 10-15% suggest code is stable once written. Changes to recently-written code are occasional and expected (requirements evolve, bugs surface in production).
- **Concerning:** Revisit rates above 30% indicate code instability. The agent may be producing code that does not fully satisfy requirements, leading to follow-up PRs that patch the same areas. Or it may indicate architectural issues where changes in one area consistently require adjustments in another.
- **Ambiguity:** This is one of the most context-dependent metrics in the set. High revisit rates can indicate:
  - **Quality issues** — Code was buggy and needed fixing. Correlate with CI Success Rate and First-Pass Acceptance Rate to confirm.
  - **Unclear requirements** — The spec changed after implementation. Correlate with Scope Creep Detection and plan metrics.
  - **Fast iteration** — The team is intentionally iterating rapidly on a new feature. This is healthy and expected in early development phases.
  - **Refactoring** — Deliberate code improvement, not quality problems. Check commit messages and PR descriptions for refactoring signals.

  Always disambiguate with other metrics before drawing conclusions from line revisit rate alone.

## Data Sources Required

- **Git blame** — To determine when each line was last modified and by which commit.
- **Git diff** — To identify which lines are being modified in the current PR.
- **Git log** — To establish the time window for "recent" modifications.

## Phase

**Phase 1** — Uses git history (blame, diff, log). No session data required.
