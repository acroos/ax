# Cache Hit Rate

## What It Measures

The proportion of input tokens that were served from the prompt cache rather than processed fresh. This is computed as the ratio of cache-read tokens to total input tokens (standard input + cache creation + cache read) across all sessions correlated to a PR.

## Why It Matters

Anthropic's prompt caching reduces the cost of cached input tokens by 90%. A high cache hit rate means the model is reusing context efficiently across turns, directly reducing token costs. Teams with consistently low cache hit rates may be structuring sessions in ways that defeat caching — for example, frequently switching context or starting new sessions for related work.

Cache hit rate turns an opaque billing line item into an actionable optimization signal.

## How It's Calculated

```
cache_hit_rate = cache_read_input_tokens / (input_tokens + cache_creation_input_tokens + cache_read_input_tokens)
```

Summed across all sessions correlated to the PR. Returns a value between 0.0 and 1.0. Returns null if there are no input tokens.

## Interpreting Values

- **Good:** Above 70% — the model is effectively reusing cached context across turns, keeping costs low.
- **Moderate:** 40-70% — some caching is happening but there may be opportunities to improve session structure.
- **Concerning:** Below 40% — most input is being processed fresh each turn. Consider whether sessions are being interrupted or restarted unnecessarily, or whether CLAUDE.md / context files are structured in a way that defeats caching.

## Data Sources Required

- **Claude Code session data** — Token usage breakdowns per assistant message, including `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`.

## Phase

**Phase 2** — Uses token data already present in session ingestion. No additional data collection needed.
