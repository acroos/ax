# Peak Context Window %

## What It Measures

The highest proportion of the model's context window used by any single message within a session. This captures how close the agent came to hitting its context limit during a coding task.

## Why It Matters

Context window exhaustion is one of the most common failure modes in agentic coding. When the agent approaches its context limit, it may lose access to earlier conversation history, produce lower-quality responses, or trigger expensive context compaction. Tracking how close sessions get to the limit helps teams identify tasks that are pushing the boundaries of the model's capacity.

High peak context usage can indicate sessions that are too long, tasks that require too much code context, or prompting patterns that accumulate unnecessary context. Teams can use this metric to decide when to break tasks into smaller pieces, when to start fresh sessions, or when to upgrade to models with larger context windows.

## How It's Calculated

The CLI computes this per-session during parsing:

```
For each assistant message in the session:
  msg_context = input_tokens + cache_creation_input_tokens + cache_read_input_tokens

peak_context_tokens = MAX(msg_context) across all messages

peak_context_pct = peak_context_tokens / model_max_context_tokens
```

The denominator uses model-specific context limits:
- Most models (Opus 4.6, Sonnet 4.5/4.6, Haiku 4.5): 200,000 tokens
- Extended context variants (detected by `[1m]` suffix in model ID): 1,000,000 tokens

The CLI computes `peak_context_pct` as a float between 0.0 and 1.0 and sends it to the server. The server stores and aggregates it directly — no server-side model lookup is needed.

Displayed as a percentage (e.g., 0.72 → 72%).

## Data Sources Required

- **Claude Code session data** — Per-message token usage breakdowns (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) and the model identifier for context limit lookup.
