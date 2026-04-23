# Skill & Tool Usage

## What It Measures

The proportion of total tool calls in a session that invoke custom skills (slash commands) or MCP (Model Context Protocol) server tools. This captures how much of the agent's work leverages team-configured tooling beyond the built-in tool set.

## Why It Matters

Claude Code ships with a standard set of built-in tools (Read, Write, Edit, Bash, Grep, etc.), but much of its power comes from extensibility — custom skills via slash commands and external tools via MCP servers. Teams that configure project-specific MCP servers (for databases, APIs, internal tools) and define custom skills get more value from agentic coding.

This metric tracks adoption of that extensibility. A team with zero Skill & Tool Usage is using Claude Code as a generic assistant. A team with meaningful usage has invested in making the agent aware of their specific workflows and systems — a sign of mature adoption.

Tracking this over time reveals whether teams are progressively customizing their agent setup or plateauing at default usage.

## How It's Calculated

```
skill_tool_usage = (skill_tool_calls + mcp_tool_calls) / total_tool_calls
```

Where:
- `skill_tool_calls` — Count of tool calls where the tool name is `Skill`.
- `mcp_tool_calls` — Count of tool calls where the tool name has an `mcp__` prefix.
- `total_tool_calls` — Total count of all tool calls in the session.

Returns a value between 0.0 and 1.0. Returns null if there are no tool calls. Displayed as a percentage.

The CLI categorizes tool calls during session parsing by inspecting the tool name in each assistant message's tool use blocks.

## Data Sources Required

- **Claude Code session data** — Tool call names from assistant messages, categorized by type (Skill, MCP, built-in).
