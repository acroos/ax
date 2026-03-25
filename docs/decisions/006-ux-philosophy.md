# ADR-006: Linear-inspired Dashboard UX

## Status
Accepted

## Date
2026-03-24

## Context
Metrics can easily feel meaningless without strong content design. Raw numbers without context lead to misinterpretation or apathy. The dashboard needs to tell a story, not just display charts.

## Decision
The dashboard must feel like Linear — sleek, minimal, dark mode first. Every metric needs inline context so users understand what they're looking at and why it matters. Ambiguity should be presented honestly rather than hidden.

**Key principles:**
- **Inline explanations on every metric card** — no metric appears without a brief description of what it means and how to interpret it
- **Plain-language trend summaries** — "Your prompt revision rate dropped 15% this week" rather than just a line going down
- **Visual hierarchy** — surface what's interesting; don't treat all metrics as equally important
- **Clean typography and restrained palette** — dark mode first, minimal chrome, content-forward

## Alternatives Considered
- **Data-dense dashboard (Grafana-style)** — overwhelming for individual developers, better suited for infra monitoring
- **Minimal CLI-only output** — covered by ADR-002; the dashboard exists specifically because some insights need visual treatment
- **Gamified dashboard** — risks trivializing metrics, can create perverse incentives

## Consequences
- Higher design bar for every new metric added to the dashboard
- Inline explanations require thoughtful copywriting, not just engineering
- Dark mode first means light mode is a follow-up, not a launch requirement
- The UX philosophy acts as a quality gate: if a metric can't be explained simply, it may not be ready to ship
