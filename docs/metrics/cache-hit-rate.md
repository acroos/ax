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

## Data Sources Required

- **Claude Code session data** — Token usage breakdowns per assistant message, including `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`.
