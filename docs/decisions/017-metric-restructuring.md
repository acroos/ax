# ADR-017: Metric Restructuring — New Top 9 with Renamed Categories

## Status
Accepted

## Date
2026-04-23

## Context
After ADR-015 pruned the metric set to 9 metrics across Output Quality / Prompt Efficiency / Agent Behavior, a metrics ideation and rating session identified that several of the kept metrics were not producing the most useful signal for teams adopting agentic coding. The categories themselves also did not map well to the questions teams actually ask: "Are we shipping faster?", "Are sessions effective?", "Is the team using advanced capabilities?"

The existing metrics (Post-Open Commits, CI Success Rate, Line Revisit Rate, Iteration Depth, Token Cost per PR, Cache Hit Rate, Sidechain Rate, Re-Read Rate, Autonomy Score) skewed heavily toward session internals. The set lacked delivery-focused metrics (cycle time, throughput) and adoption maturity signals (tool usage depth, code review rigor).

## Decision

Replace the displayed metric set with a new top 9 across three renamed categories:

**Delivery** (How fast and cleanly does code ship?)
- Task Cycle Time (NEW) — hours from first session to PR merge/close
- PR Throughput (NEW) — merged PRs per contributor per week
- Post-Open Commits (kept)

**Session Effectiveness** (How well do sessions use time and resources?)
- Iteration Depth (kept)
- Peak Context Window (NEW) — highest % of model context used in any message
- Autonomy Score (kept, moved from Agent Behavior)

**Adoption Maturity** (How deeply has the team adopted agent capabilities?)
- Skill & Tool Usage (NEW) — fraction of tool calls using slash commands or MCP tools
- Subagent Delegation (NEW) — fraction of tool calls delegating to subagents
- Rubber Stamp Rate (NEW) — fraction of large PRs merged within 5 minutes

The 6 old displayed metrics that are no longer in the top 9 (CI Success Rate, Line Revisit Rate, Token Cost per PR, Cache Hit Rate, Sidechain Rate, Re-Read Rate) remain computed and accessible via metric detail pages. They are marked `displayed: false` in `metric-defs.ts`.

### New data requirements

Three of the new metrics required new session data fields:
- **Peak Context Window**: CLI computes `peak_context_pct` (0.0-1.0) from per-message token counts and model-specific context limits (`pricing.LookupMaxContext`). Stored on `sessions`.
- **Skill & Tool Usage**: Uses `skill_tool_calls` + `mcp_tool_calls` / `total_tool_calls`. CLI categorizes tool calls by name (Agent, Skill, mcp__ prefix). Stored on `sessions`.
- **Subagent Delegation**: Uses `agent_tool_calls` / `total_tool_calls`. Same CLI categorization.

New `sessions` columns: `peak_context_pct` (float), `total_tool_calls` (int), `agent_tool_calls` (int), `skill_tool_calls` (int), `mcp_tool_calls` (int).

### Computation patterns

The new metrics introduced two new computation patterns in `MetricsAggregator`:
- **Joined PR metrics** (Task Cycle Time): subquery joins `session_prs → sessions` to find earliest session start per PR, then computes hours to terminal date.
- **Special aggregate metrics** (PR Throughput): no per-PR value; computed as `merged_count / contributors / weeks` directly.
- **Computed PR expressions** (Rubber Stamp Rate): binary per-PR SQL expression evaluated at query time from `prs` columns.

## Alternatives Considered

**Keep existing categories, just swap metrics.** Rejected because the old category names (Output Quality, Prompt Efficiency, Agent Behavior) did not communicate actionable intent to users. The new names frame metrics as questions teams care about.

**Add new metrics without hiding old ones (12+ displayed).** Rejected because information density matters more than coverage. 9 metrics (3 per category) is the right density for an overview grid. Users who want the hidden metrics can still access them via detail pages.

**Compute Peak Context % server-side.** Would require model-context-limit lookup tables in the Rails server. Since the CLI already knows the model, pre-computing in the CLI is simpler and avoids coupling the server to Claude model metadata.

## Consequences

- Supersedes the metric display set from ADR-015. ADR-015's "Kept" section (Output Quality / Prompt Efficiency / Agent Behavior) is now historical.
- The dashboard overview grid is now data-driven: loops over `CATEGORIES` and `DISPLAYED_METRICS` instead of hardcoding 9 metric cards. Adding or reordering metrics only requires changing `metric-defs.ts`.
- Historical data gap: new session fields (`peak_context_pct`, tool counts) are 0/null for sessions pushed before the CLI update. These metrics show sparse data initially.
- Old CLIs pushing without the new fields will have them default to 0 (tool counts) or null (peak_context_pct) — no breaking change.
- 6 new metric documentation pages added to `docs/metrics/`.
