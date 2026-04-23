# Task Cycle Time

## What It Measures

The elapsed time from when a developer first starts working on a task to when the resulting PR is merged or closed. Specifically, it measures the hours between the earliest session start time (across all sessions linked to a PR) and the PR's terminal date (merge or close).

## Why It Matters

Task Cycle Time captures the end-to-end delivery speed of agentic coding work. Unlike time-to-merge (which conflates review latency with development time), this metric starts the clock when the developer actually begins coding — not when the PR is opened.

Shorter cycle times indicate that the agent is helping developers move from idea to merged code quickly. Long cycle times may reveal bottlenecks: sessions that stall, PRs that sit in review, or tasks that require multiple coding sessions spread across days.

Tracking this over time shows whether your team is getting faster at delivering work with AI assistance, or whether complexity is creeping in.

## How It's Calculated

```
task_cycle_time_hours = (pr_terminal_date - earliest_session_start) / 3600

where:
  pr_terminal_date    = COALESCE(merged_at, closed_at)
  earliest_session_start = MIN(sessions.started_at) across all sessions linked to the PR
```

The metric requires at least one session linked to the PR via the `session_prs` join table. PRs with no linked sessions are excluded (the metric returns null).

The value is expressed in hours. A PR where the first session started at 9:00 AM and was merged at 12:30 PM the same day has a task cycle time of 3.5 hours.

## Data Sources Required

- **Claude Code session data** — Session start timestamps, linked to PRs via the `session_prs` table.
- **GitHub API** — PR merge/close timestamps for determining the terminal date.
