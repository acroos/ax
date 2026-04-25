# ADR-009: Token Cost Metrics

## Status
Superseded by ADR-017 and Copilot CLI support

## Date
2026-03-24

## Context
Raw token counts are noisy without task complexity context — a session consuming 100k tokens may represent focused implementation work or inefficient context loading. This ADR originally chose dollar-denominated cost, but Copilot CLI support requires a provider-neutral unit because Copilot-served model pricing is not reliably attributable from local session data.

The previously deferred "Token Usage per PR" metric highlighted the need for efficiency tracking. The current implementation uses raw `input_tokens + output_tokens` as the cross-agent unit and keeps cache token fields for cache-efficiency metrics.

## Decision
Track **Token Total per PR** as `input_tokens + output_tokens` across sessions correlated to a PR. Sessions carry an `agent_type` (`claude_code` or `copilot_cli`) so dashboards can show all agents combined by default or filter to one agent.

Implementation details:
- Store raw token fields on `sessions`; do not store precomputed dollar cost.
- Keep model identifiers and context-window lookup for peak context metrics.
- Use `agent_type` filtering at the API layer for aggregate and metric-detail views.
- Do not compute Unmerged Token Spend as a dollar metric.

## Alternatives Considered
- **Dollar costs** — originally selected, but provider-specific pricing made cross-agent comparisons brittle once Copilot CLI support was added
- **External billing API** — adds complexity, latency, and a dependency on Anthropic's billing system availability; also cannot attribute cost to individual PRs
- **Per-session cost only** — useful but does not correlate effort to deliverables (PRs), making it harder to evaluate whether agent work is proportional to value produced

## Consequences
- Token totals are not equivalent to billing cost, especially across models, but they are stable across supported agents.
- Model-specific pricing maintenance is no longer required for the dashboard metric.
- Historical sessions default to `claude_code` so existing Claude Code data remains filterable.
