# Autonomy Score

## What It Measures

The ratio of assistant messages to human messages across sessions correlated to a PR. This measures how much work the agent does independently for each human intervention.

## Why It Matters

A core promise of agentic coding is that the developer provides high-level direction while the agent handles implementation details. Autonomy Score quantifies this: a score of 5.0 means the agent produces 5 messages for every 1 human message, indicating the agent is executing multi-step workflows with minimal hand-holding.

Low autonomy scores suggest the developer is micromanaging — issuing individual commands rather than letting the agent plan and execute. This could indicate trust issues, poor prompting habits, or tasks that genuinely require tight human oversight.

Tracking autonomy over time reveals whether developers are learning to delegate effectively to the agent.

## How It's Calculated

```
autonomy_score = assistant_message_count / human_message_count
```

Summed across all sessions correlated to the PR. Returns null if there are no human messages.

Unlike Iteration Depth (which counts human turns as a raw number), Autonomy Score normalizes against the agent's work output — a session with 3 human turns and 30 agent turns is very different from 3 human turns and 5 agent turns.

## Interpreting Values

- **Good:** Above 3.0 — the agent is doing substantial independent work per human prompt, indicating effective delegation.
- **Moderate:** 1.5-3.0 — the developer and agent are trading messages roughly equally, which may be appropriate for exploratory or conversational work.
- **Low:** Below 1.5 — nearly 1:1 messaging, suggesting the developer is providing step-by-step instructions rather than high-level goals. Consider whether the developer could give broader prompts.

## Data Sources Required

- **Claude Code session data** — Human message count and assistant message count per session.

## Phase

**Phase 2** — Requires sending assistant message counts (already parsed but previously not transmitted).
