# Messages per PR

## What It Measures

The total number of human-authored messages in Claude Code session(s) that are correlated to a given pull request. This counts every prompt the developer sends to the agent during the lifecycle of a PR, from initial implementation through any follow-up fixes.

## Why It Matters

Messages per PR is a proxy for how much human steering was required to produce the final result. A lower message count suggests the agent understood the intent quickly and executed with minimal guidance. A high count may indicate unclear initial prompts, agent confusion, or tasks that required heavy course-correction.

Over time, tracking this metric helps teams understand whether their prompting practices, planning workflows, or agent configurations are improving developer efficiency.

## How It's Calculated

1. Identify all Claude Code sessions associated with a PR. Session-to-PR correlation can be established by matching commit SHAs in the session to commits on the PR branch, or via explicit session metadata linking.
2. Within each session, count messages where the role is `user` (human-authored messages). System messages and agent responses are excluded.
3. Sum the human message count across all correlated sessions.

```
messages_per_pr = sum(
  count(message for message in session.messages if message.role == "user")
  for session in pr.correlated_sessions
)
```

## Interpreting Values

- **Good:** Low single digits (1-5 messages) for straightforward PRs suggest the agent understood the task and executed cleanly. The ideal is a single well-crafted prompt producing a complete, merge-ready PR.
- **Concerning:** Double-digit message counts for simple PRs may indicate the developer is micro-managing the agent, the initial prompt lacked clarity, or the agent repeatedly misunderstood intent. Consistently high counts across a team may point to systemic issues with prompt quality or agent configuration.
- **Ambiguity:** High message counts are not inherently bad. Complex multi-step tasks, exploratory work, or intentional iterative refinement will naturally require more messages. Always consider task complexity when evaluating this metric. Compare against similar PRs by size, type, or scope for meaningful benchmarks.

## Data Sources Required

- **Claude Code session data** — Full message transcripts with role annotations (`user`, `assistant`, `system`) and timestamps.
- **Session-to-PR correlation** — A mapping between sessions and PRs, derived from commit SHAs, branch names, or explicit metadata.

## Phase

**Phase 2** — Requires Claude Code session data ingestion.
