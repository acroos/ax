# ADR-018: Plug-and-Play Agent Provider System

## Status
Accepted

## Date
2026-04-27

## Context
After PR #232 shipped Copilot CLI support, AX had two agents wired in — Claude Code and Copilot CLI — but adding a third agent required edits across seven distinct surfaces:

1. **Agent identity** — free-form strings (`"claude_code"`, `"copilot_cli"`) duplicated in 11 places across CLI, Rails allowlist, TypeScript union types, dashboard label maps, and aggregator join keys.
2. **Session discovery** — two ad-hoc functions called sequentially in `main.go` and `bulk/discovery.go`; each new agent appended another call.
3. **Session parsing** — a dispatcher in `claude_sessions.go` sniffed the file layout to decide which parser to invoke; no registry, new formats added a new branch.
4. **Tool taxonomy** — each parser hardcoded its agent's tool names and mapped them to AX categories; Cursor tool names differ from both Claude and Copilot.
5. **Metric availability per agent** — an ad-hoc nil/pointer dance in `ToSessionData()` and `push_service.rb`; no declared capability matrix.
6. **Hook installation** — two unrelated installers for different file shapes and scopes, orchestrated by hand in `main.go:initManagedMode`.
7. **Repo identity from local state** — each agent derives the canonical `owner/repo` differently; no common contract.

The research document (`plans/research/multi-agent-abstractions.md`) identified these surfaces and concluded the right abstraction is two interfaces — a `Provider` interface for session discovery and parsing, and an `Installer` interface for hook management — backed by a single codegen-driven agent registry.

The implementation plan (`plans/multi-agent-abstractions.md`) used Cursor as a forcing-function third agent so the abstractions were validated by a real integration rather than designed in the abstract. Phases 1–8 of that plan have been implemented in this branch.

## Decision

**Single codegen-driven agent registry.** `config/agents.yaml` is the sole source of truth for all agent metadata and capability declarations. A Ruby codegen script (`scripts/codegen-agents/generate.rb`) emits four `*.gen.*` outputs that each language layer consumes:

- `cli/internal/agents/registry.gen.go` — Go constants and `Registry()` map
- `server/app/models/agent_registry.rb` — Ruby `AgentRegistry` module with helper methods
- `dashboard/src/lib/agents.gen.ts` — TypeScript types, labels, colors, and capability functions
- `server/db/agent_types.txt` — Plain-text allowlist for Rails validation

Adding a new agent is a single edit to `agents.yaml` followed by `just codegen-agents`. CI enforces freshness via `just codegen-agents-check` on every PR.

**`agents.Provider` interface for discovery and parsing.** Each agent implements one interface (`cli/internal/agents/provider.go`) with methods for `ID()`, `HomeDir()`, `HomeExists()`, `DiscoverSessions()`, and `Parse()`. The CLI push loop iterates `agents.RegisteredProviders()` without hardcoding per-agent logic. Per-agent implementations live under `cli/internal/agents/<id>/`.

**`hooks.Installer` interface for hook installation.** Each agent implements `cli/internal/hooks/installer.go` with `Install()`, `Uninstall()`, and `IsInstalled()`. `ax init` iterates `hooks.RegisteredInstallers()`. A shared `pushcommand` package generates the parameterized bash one-liner used by all agent hook files. Per-agent installers live under `cli/internal/hooks/<id>/`.

**`payload_version` on the wire.** `PushPayload.PayloadVersion` (currently always `1`) lets the server reject payloads it cannot interpret and gives a migration path for future breaking field changes. Adding a new optional field stays at v1; semantics-changing modifications bump the version.

**Static capability matrix.** Each agent declares in `agents.yaml` which session fields it supplies and which metrics it supports. This matrix drives:
- CLI: `ToSessionData()` sends `nil` for unsupported fields (token columns are now nullable).
- Server: `AgentRegistry.supports_field?` gates column writes in `PushService`; `MetricsAggregator` filters metric expressions to those whose required fields are supported by the current `agent_type`.
- Dashboard: `agentSupportsMetric(id, slug)` from `agents.gen.ts` drives `<AgentTypeFilter />` visibility and `"N/A"` rendering in metric cards.

**`extras` JSONB landing zone.** Session rows carry an `extras jsonb` column for agent-specific data that does not (yet) map to a typed column. Initial keys: `commit_attribution` and `conversation_summary` for Cursor. Future agents add their own keys; promotion to a typed column happens when a metric requires the data.

**Pricing stays Claude-only** until a metric demands per-agent pricing. Copilot and Cursor have `peak_context_pct: false` in the capability matrix; the `pricing.LookupMaxContext` function remains Claude-specific.

**Cursor as the third agent.** `cli/internal/agents/cursor/` and `cli/internal/hooks/cursor/` implement both interfaces. Cursor's `sessionEnd` hook is reportedly unreliable in CLI mode (as of January 2026); the setup doc notes the manual `ax push --repo .` fallback.

## Alternatives Considered

**Plugin / ABI approach** — Dynamically loaded agent plugins would remove the compile-time coupling, but Go has no stable plugin ABI for this use case, and the operational complexity (versioning, distribution, symbol conflicts) is not justified when the number of agents is small. The codegen-driven static registry achieves the same "one-file addition" ergonomic without the ABI problem.

**Generic "session JSONL" with no per-agent code** — A single generic parser that accepts arbitrary JSONL would eliminate per-agent parsing code, but it is too lossy: Cursor's event schema, tool taxonomy, and repo-identity mechanism are fundamentally different from Claude and Copilot. Per-agent code is necessary for correct data extraction; the `Provider` interface just makes it a first-class contract instead of ad-hoc branching.

**Server-side polled ingestion** — Cursor Enterprise and Copilot Business both expose admin APIs that could supply token data without CLI instrumentation. This would enable richer metrics for agents with unreliable or missing hook systems. Deferred — the design involves a different abstraction (`ServerProvider`) and is out of scope for this plan. A future ADR will address it.

## Consequences

- Adding a fourth agent requires: one `agents.yaml` edit, `just codegen-agents`, implementing `cli/internal/agents/<id>/provider.go` and (optionally) `cli/internal/hooks/<id>/installer.go`, and registering both. All other layers update from generated code.
- `*.gen.*` files must never be hand-edited; CI's `codegen-check` job will fail on drift. The codegen invariants (snake_case IDs, complete field/metric declarations, valid hex color) are enforced by `scripts/codegen-agents/schema.rb`.
- Token columns (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) are now nullable in the database. Existing Claude/Copilot rows retain their integer values; Cursor rows arrive with `NULL` for these columns.
- Dashboard metric cards show "N/A" when the selected agent filter doesn't support a metric, rather than zero or a misleading average.
- The `agent_type` column no longer has a default value (`"claude_code"` default dropped). Every push payload must include `agent_type`.
- Server-side `ServerProvider` for Cursor Admin API and Copilot Business endpoints is deferred to a future ADR.

## References

- `plans/multi-agent-abstractions.md` — full implementation plan (Phases 1–9)
- `plans/research/multi-agent-abstractions.md` — coupling audit and surface identification
- PR #232 — Copilot CLI support (the integration that exposed the coupling)
- PR #239 — Research doc
- PR #240 — Implementation plan
- PR #241 — Phase 1: agent registry + codegen pipeline
- PR #242 — Phase 2: wire-format versioning + capability declarations
- PR #243 — Phase 3: provider interface refactor (Go)
- PR #244 — Phase 4: server capability-aware aggregator + `/api/v1/agents`
- PR #245 — Phase 5: dashboard capability-aware filter + N/A rendering
- PR #246 — Phase 6: hook installer interface refactor
- PR #247 — Phase 7: Cursor CLI provider
- PR #248 — Phase 8: Cursor extras (commit attribution + summary)
- ADR-005 — Session ingestion strategy (now generalized via `agents.Provider`)
- ADR-009 — Token cost metrics (tokens are now agent-capability-gated)
- ADR-014 — Remove local mode (this plan is fully managed-only)
- ADR-015 — Design system (dashboard work obeys Parchment & Clay constraints)
- ADR-017 — Metric restructuring (capability matrix uses ADR-017 metric slugs)
