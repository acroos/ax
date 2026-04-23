# Rubber Stamp Rate

## What It Measures

The fraction of merged PRs that were approved suspiciously quickly relative to their size. A PR is flagged as "rubber-stamped" when it has a non-trivial diff (50+ lines changed) but was merged within 5 minutes of being opened.

## Why It Matters

Code review exists to catch bugs, enforce standards, and share knowledge. When a substantial PR is merged almost immediately after opening, it suggests the review was superficial — or skipped entirely. This is a known risk with agentic coding: if the agent produces code that *looks* right and the team trusts it implicitly, review quality can silently degrade.

Rubber Stamp Rate is a health check on your review process. A low rate (close to 0%) means large PRs are getting meaningful review time. A rising rate is a signal to investigate — are developers auto-merging agent output? Are review norms eroding? Is the team under delivery pressure that's compressing review time?

This metric is deliberately conservative. Small PRs (under 50 lines) are excluded because quick merges on small changes are normal and expected. The 5-minute threshold catches only the most obvious cases — a PR with 200 changed lines merged in 2 minutes almost certainly wasn't reviewed line-by-line.

## How It's Calculated

Each merged PR receives a binary value (0 or 1):

```
rubber_stamped = 1  if (additions + deletions >= 50)
                       AND (minutes_from_open_to_merge <= 5)
               = 0  otherwise

where:
  minutes_from_open_to_merge = (merged_at - created_at) / 60
```

The aggregate Rubber Stamp Rate is the average across all finalized (merged) PRs in the window — effectively the percentage of PRs that were rubber-stamped.

PRs that were closed without merging are excluded.

## Data Sources Required

- **GitHub API** — PR metadata including `created_at`, `merged_at`, `additions`, and `deletions`.
