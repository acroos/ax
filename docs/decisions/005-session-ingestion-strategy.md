# ADR-005: Claude Code Hooks for Team Data Ingestion

## Status
Accepted

## Date
2026-03-24

## Context
For team adoption, we need a way to get Claude Code session data from each engineer's machine to a central system. The mechanism should be lightweight, require minimal setup, and not interfere with the developer's workflow.

## Decision
Use Claude Code hooks for ingestion. Running `ax init` installs a hook that automatically runs `ax push` after Claude Code sessions complete. No background daemon is needed.

Flow:
1. Developer runs `ax init` once
2. A Claude Code hook is registered
3. After each session, the hook triggers `ax push`
4. Session data is sent to the configured destination (local store or remote endpoint)

## Alternatives Considered
- **Background sync daemon** — heavier, requires process management, potential battery/resource concerns on developer machines
- **GitHub-only / no session data** — loses session-dependent metrics (prompt efficiency, agent behavior), which are core to our value proposition
- **Manual export** — too much friction, adoption would be low

## Consequences
- Zero-friction ingestion after one-time setup
- Depends on Claude Code's hook system remaining stable and capable
- No always-running process to manage or debug
- Team rollout is as simple as each developer running `ax init`

> **Update (ADR-018):** The hook-based ingestion pattern has been generalized via the `agents.Provider` and `hooks.Installer` interfaces. Claude Code, Copilot CLI, and Cursor CLI each implement these interfaces; adding a new agent no longer requires hand-editing the `ax init` orchestration loop. See [ADR-018](018-multi-agent-abstractions.md).
