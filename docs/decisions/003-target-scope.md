# ADR-003: Open Source with Managed Service Path

## Status
Accepted

## Date
2026-03-24

## Context
We need to decide the intended audience and distribution model for AX. This affects licensing, architecture, and feature prioritization.

## Decision
Open source, designed for general use. The evolution path is:

1. **Local MVP** — single developer, local data, immediate value
2. **Team / self-hosted** — shared metrics, central ingestion, on-prem deployment
3. **Managed service** — hosted version with team management, integrations, and support

## Alternatives Considered
- **Personal use only** — limits impact, no path to sustainability, misses the team-level insights that make metrics most valuable
- **Team-only SaaS from the start** — harder to bootstrap, requires infrastructure and auth before delivering any value

## Consequences
- Open source drives adoption and community contributions
- Architecture must support local-first with a clear path to multi-user/hosted without major rewrites
- Monetization comes later via managed service, not by restricting the open source version
