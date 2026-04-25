# Token Total per PR

## What It Measures

The total number of input and output tokens consumed across all agentic coding sessions correlated to a pull request.

## Why It Matters

High token usage on simple PRs signals inefficient workflows — poor prompts, unnecessary iteration, or excessive context loading. Raw tokens are also the common unit across Claude Code and Copilot CLI sessions, so the metric can compare agents without depending on provider-specific pricing tables.

Normalizing tokens by PR complexity (lines changed) helps identify outlier PRs where agent work is disproportionate to the code produced. Over time, tracking token trends reveals whether prompt practices, agent configurations, or workflow improvements are translating into real efficiency gains.

## How It's Calculated

1. Identify all Claude Code or Copilot CLI sessions associated with a PR via session-to-PR correlation (commit SHAs, branch names, or explicit metadata).
2. Sum each correlated session's input and output tokens.

```
token_total_per_pr = sum(
    session.input_tokens + session.output_tokens
    for session in pr.correlated_sessions
)
```

Cache tokens are retained separately for cache-efficiency metrics, but this metric intentionally uses input plus output tokens so it has the same meaning across supported agents.

## Data Sources Required

- **Agent session data** — Session usage fields including `input_tokens`, `output_tokens`, cache token counts, model identifier, and `agent_type`.
