# Token Cost per PR

## What It Measures

The total dollar cost of tokens consumed across all Claude Code sessions correlated to a pull request. Cost is computed per-message using model-specific pricing — input tokens multiplied by the model's input price, plus output tokens multiplied by the model's output price, plus cache tokens at their respective rates — then aggregated across all messages in all correlated sessions.

## Why It Matters

High token cost on simple PRs signals inefficient workflows — poor prompts, unnecessary iteration, or excessive context loading. Raw token counts are noisy because different models have different pricing and because token volume alone does not capture the economic impact. Dollar cost is a more intuitive and actionable unit.

Normalizing cost by PR complexity (lines changed) helps identify outlier PRs where spend is disproportionate to the work produced. Over time, tracking cost trends reveals whether prompt practices, agent configurations, or workflow improvements are translating into real efficiency gains.

## How It's Calculated

1. Identify all Claude Code sessions associated with a PR via session-to-PR correlation (commit SHAs, branch names, or explicit metadata).
2. For each message in each correlated session, compute cost using the model that processed the message:
   - `message_cost = (input_tokens × model_input_price) + (output_tokens × model_output_price) + (cache_creation_tokens × cache_creation_price) + (cache_read_tokens × cache_read_price)`
3. Sum message costs across all messages in all correlated sessions.

```
token_cost_per_pr = sum(
    (msg.usage.input_tokens * pricing[msg.model].input_price)
    + (msg.usage.output_tokens * pricing[msg.model].output_price)
    + (msg.usage.cache_creation_tokens * pricing[msg.model].cache_creation_price)
    + (msg.usage.cache_read_tokens * pricing[msg.model].cache_read_price)
    for session in pr.correlated_sessions
    for msg in session.messages
)
```

Per-message computation handles mixed-model sessions correctly — if a session uses multiple models (e.g., Haiku for quick lookups and Opus for complex reasoning), each message is priced at its own model's rate.

## Interpreting Values

- **Good:** Cost proportional to PR complexity. Small bug fixes under $5, medium features $10-30, large features $30-80. Cost trending downward over time for similar-complexity work indicates improving prompt efficiency.
- **Concerning:** Simple PRs costing $50+, or cost increasing over time for similar-complexity work. Consistently high cost relative to lines changed suggests the developer or agent is burning tokens unproductively — excessive context loading, repeated failed attempts, or overly verbose prompting.
- **Ambiguity:** Complex exploratory work legitimately costs more. First-time work in unfamiliar areas costs more than subsequent work in the same area. Don't compare across different task types — a greenfield architecture spike will naturally cost more than a well-defined bug fix. Always consider task complexity and novelty when evaluating cost outliers.

## Data Sources Required

- **Claude Code session data** — Per-message usage fields including `input_tokens`, `output_tokens`, cache token counts, and the `model` identifier for each message.
- **Pricing module** — A model-specific pricing map that converts token counts to dollar costs. Must include input, output, and cache token rates for each supported model, with version tracking for pricing changes.

## Phase

**Phase 2** — Requires Claude Code session data ingestion.
