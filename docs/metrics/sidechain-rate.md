# Sidechain Rate

## What It Measures

The fraction of Claude Code messages in a session that occurred on sidechain branches — alternate reasoning paths the model explored and then abandoned. Sidechain messages represent work the model did that didn't contribute to the final output.

## Why It Matters

When Claude Code backtracks, it creates sidechain branches — invisible to the user but consuming tokens and time. A high sidechain rate means the model is frequently going down wrong paths before finding the right approach. This is a direct measure of wasted effort.

Tracking sidechain rate helps identify tasks or prompting patterns that confuse the model. If certain types of requests consistently produce high sidechain rates, that's a signal to improve prompt clarity, provide better context via CLAUDE.md, or break the task into smaller pieces.

## How It's Calculated

```
sidechain_rate = sidechain_messages / (human_messages + assistant_messages)
```

Summed across all sessions correlated to the PR. Returns a value between 0.0 and 1.0. Returns null if there are no messages or if the agent does not expose an equivalent sidechain signal. Copilot CLI sessions are excluded from this metric rather than counted as zero-sidechain sessions.

## Data Sources Required

- **Claude Code session data** — Message-level `isSidechain` flag from session JSONL files.
