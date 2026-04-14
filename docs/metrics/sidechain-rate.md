# Sidechain Rate

## What It Measures

The fraction of messages in a session that occurred on sidechain branches — alternate reasoning paths the model explored and then abandoned. Sidechain messages represent work the model did that didn't contribute to the final output.

## Why It Matters

When Claude Code backtracks, it creates sidechain branches — invisible to the user but consuming tokens and time. A high sidechain rate means the model is frequently going down wrong paths before finding the right approach. This is a direct measure of wasted effort.

Tracking sidechain rate helps identify tasks or prompting patterns that confuse the model. If certain types of requests consistently produce high sidechain rates, that's a signal to improve prompt clarity, provide better context via CLAUDE.md, or break the task into smaller pieces.

## How It's Calculated

```
sidechain_rate = sidechain_messages / (human_messages + assistant_messages)
```

Summed across all sessions correlated to the PR. Returns a value between 0.0 and 1.0. Returns null if there are no messages.

## Interpreting Values

- **Good:** Below 10% — the model is finding effective paths without much backtracking.
- **Moderate:** 10-25% — some exploration is happening, which may be expected for complex tasks.
- **Concerning:** Above 25% — significant backtracking suggests the model is struggling with the task. Consider whether the prompt is ambiguous, the codebase context is insufficient, or the task scope is too broad.

## Data Sources Required

- **Claude Code session data** — Message-level `isSidechain` flag from session JSONL files.

## Phase

**Phase 2** — Requires parsing the `isSidechain` field from Claude Code session data.
