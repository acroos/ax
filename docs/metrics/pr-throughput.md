# PR Throughput

## What It Measures

The rate at which merged pull requests are delivered, normalized by the number of contributors and expressed as PRs per person per week. This is a team-level delivery velocity metric — it has no per-PR backing value.

## Why It Matters

PR Throughput answers the most fundamental delivery question: how much work is the team shipping? Raw PR counts are misleading — a 10-person team merging 20 PRs/week is performing very differently from a 2-person team merging 20 PRs/week.

By normalizing per contributor per week, this metric enables fair comparison across teams of different sizes and across time windows of different lengths. It also reveals whether agentic coding is actually increasing delivery output or just shifting where time is spent.

A rising throughput trend suggests the team is leveraging AI assistance to ship more work. A declining trend may indicate growing complexity, process bottlenecks, or a shift toward larger PRs (check in tandem with Task Cycle Time).

## How It's Calculated

```
pr_throughput = merged_pr_count / distinct_contributors / (window_days / 7.0)
```

Where:
- `merged_pr_count` — Number of PRs merged within the time window.
- `distinct_contributors` — Number of unique PR authors among those merged PRs.
- `window_days / 7.0` — Converts the time window to weeks.

Only merged PRs are counted — closed-without-merge PRs are excluded. If there are no merged PRs in the window, the metric returns null.

The sparkline shows daily merged PR counts (not the normalized rate) to give a visual sense of delivery cadence.

## Data Sources Required

- **GitHub API** — PR metadata including `merged_at` timestamp and `author` for contributor counting.
