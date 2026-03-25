# ADR-002: CLI + Web Dashboard Form Factor

## Status
Accepted

## Date
2026-03-24

## Context
We need to decide how users interact with AX. The tool must support data ingestion from Claude Code sessions, reporting/querying, and visual exploration of metrics.

## Decision
Two-part form factor:
- **CLI** (`ax`) for data ingestion, querying, and reporting
- **Local web dashboard** (`ax dashboard`) for visualization and exploration

The CLI is the primary interface for automation and scripting. The dashboard provides rich visual context that a terminal cannot.

## Alternatives Considered
- **Claude Code plugin only** — limited cross-session data persistence, no rich visualization capabilities
- **GitHub App only** — heavier infrastructure requirement, team-focused from the start, no local/individual use
- **CLI only** — works for power users but lacks the visual dashboard needed to make metrics meaningful and explorable

## Consequences
- Users get the best of both worlds: scriptable CLI and visual dashboard
- Two interfaces to maintain, but they share the same underlying data and logic
- Local-first approach means users can get value immediately without any hosted infrastructure
