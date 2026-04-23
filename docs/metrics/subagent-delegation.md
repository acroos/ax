# Subagent Delegation Rate

## What It Measures

The proportion of total tool calls in a session that spawn subagents via the `Agent` tool. This captures how often the coding agent delegates subtasks to independent child agents rather than handling everything in a single execution thread.

## Why It Matters

Subagent delegation is one of the most powerful features of agentic coding. When the agent spawns subagents, it can parallelize work — researching in one thread while implementing in another — and isolate complex subtasks to keep the main conversation focused. Effective use of subagents is a hallmark of sophisticated agentic workflows.

Low delegation rates aren't inherently bad — simple tasks don't need subagents. But for teams working on complex codebases, a consistently low rate may indicate that sessions are structured in ways that prevent the agent from leveraging parallelism. Conversely, very high delegation rates might suggest over-fragmentation.

This metric helps teams understand whether their prompting patterns and task structures are enabling the agent to work at its full capacity.

## How It's Calculated

```
subagent_delegation = agent_tool_calls / total_tool_calls
```

Where:
- `agent_tool_calls` — Count of tool calls where the tool name is `Agent`.
- `total_tool_calls` — Total count of all tool calls in the session.

Returns a value between 0.0 and 1.0. Returns null if there are no tool calls. Displayed as a percentage.

The CLI categorizes tool calls during session parsing by inspecting the tool name in each assistant message's tool use blocks.

## Data Sources Required

- **Claude Code session data** — Tool call names from assistant messages, with `Agent` calls counted separately.
