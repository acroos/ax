# ADR-001: Metrics Selection

## Status
Accepted

## Date
2026-03-24

## Context
We need to define what to measure for agentic coding developer experience. The metrics must be actionable, measurable, and cover four dimensions: prompt efficiency, output quality, planning effectiveness, and agent behavior.

## Decision
14 metrics approved across 4 categories:

**Prompt Efficiency**
1. **Prompt-to-commit ratio** — number of prompts needed per meaningful commit
2. **Prompt revision rate** — how often a user rephrases/retries a prompt
3. **Session duration** — wall-clock time of a coding session
4. **Prompts per session** — total prompts issued in a session

**Output Quality**
5. **First-pass acceptance rate** — percentage of agent output accepted without edits
6. **Edit distance after generation** — how much the user modifies agent-generated code
7. **Test pass rate on generated code** — percentage of generated code passing tests on first run
8. **Lint/type-check pass rate** — percentage of generated code passing static analysis

**Planning Effectiveness**
9. **Plan adherence score** — how closely the final output matches the stated plan
10. **Scope drift ratio** — files touched vs. files originally planned
11. **Task completion rate** — percentage of planned tasks completed per session

**Agent Behavior**
12. **Tool call efficiency** — ratio of productive tool calls to total tool calls
13. **Context window utilization** — how much of the available context window is used
14. **Error recovery rate** — how often the agent self-corrects after a failed action

**Deferred metrics:**
- **Time-to-PR** — context switching muddies wall-clock measurement, making it unreliable
- **Review feedback density** — low density might indicate rubber-stamping rather than quality

**Note:** PR size distribution is treated as a dimension (grouping/filtering axis), not a standalone metric.

## Alternatives Considered
- **Fewer metrics (5-7)** — too narrow to capture the full agentic workflow; misses entire categories
- **Survey-based metrics** — subjective, not automatable, adds friction to developer workflow
- **Traditional DX metrics (DORA, SPACE)** — don't capture agentic dynamics like prompt efficiency or agent self-correction

## Consequences
- We have a comprehensive measurement framework covering the full agentic coding loop
- 14 metrics is a significant implementation surface; prioritization of which to build first will be needed
- Deferred metrics can be revisited once we have better data collection infrastructure
