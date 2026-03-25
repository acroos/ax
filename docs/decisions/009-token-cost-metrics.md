# ADR-009: Token Cost Metrics

## Status
Accepted

## Date
2026-03-24

## Context
Raw token counts are noisy without task complexity context — a session consuming 100k tokens could be cheap (Haiku) or expensive (Opus). Cost in dollars is a more intuitive and actionable unit for evaluating prompt efficiency. Additionally, we want to surface how much spend goes to work that never merges, which requires a repo-level aggregate view that raw per-session token counts cannot provide.

The previously deferred "Token Usage per PR" metric highlighted the need for cost normalization. Rather than tracking raw tokens, we are evolving that concept into dollar-cost metrics with model-specific pricing.

## Decision
Add two metrics:

1. **Token Cost per PR (Metric #15)** — Per-message cost computation using model-specific pricing (`input_tokens × input_price + output_tokens × output_price + cache_tokens × cache_rates`), summed across all messages in all sessions correlated to a PR. Per-message granularity handles mixed-model sessions correctly.

2. **Unmerged Token Spend (Metric #16)** — Repo-level aggregate of dollar cost on sessions that correlate to closed-not-merged PRs or don't correlate to any PR. Expressed as both absolute dollars and as a rate (`unmerged_cost / total_cost`). Open PRs are excluded from the calculation.

Implementation details:
- Store both raw tokens AND precomputed dollar cost. Raw tokens enable recomputation when pricing changes.
- Use a hardcoded pricing map with version tracking. Each entry maps a model identifier to its input, output, and cache token rates.
- Mixed-model sessions are handled naturally via per-message computation — each message carries its own model identifier.
- The repo-level Unmerged Token Spend metric requires a new `repo_metrics` table, as existing metrics are all per-PR.

## Alternatives Considered
- **Raw token counts only** — not actionable; a session using 50k Haiku tokens costs a fraction of one using 50k Opus tokens, but raw counts treat them equally
- **External billing API** — adds complexity, latency, and a dependency on Anthropic's billing system availability; also cannot attribute cost to individual PRs
- **Per-session cost only** — useful but does not correlate cost to deliverables (PRs), making it harder to evaluate whether spend is proportional to value produced

## Consequences
- Pricing needs manual updates when Anthropic changes model prices. The hardcoded pricing map must be versioned so changes are tracked.
- Recomputation is needed when pricing changes — storing raw tokens alongside precomputed cost enables this without re-ingesting session data.
- The repo-level Unmerged Token Spend metric requires a new `repo_metrics` table, expanding the data model beyond per-PR metrics for the first time.
- Dollar cost provides a universally understood unit that enables cross-team and cross-model comparisons.
