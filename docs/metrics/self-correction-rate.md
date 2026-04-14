# Self-Correction Rate

## What It Measures

The proportion of error corrections in a session that were initiated by the agent versus requested by the human. This metric distinguishes between the agent detecting and fixing its own mistakes (self-correction) and the human having to point out errors and ask for fixes (human-requested correction).

## Why It Matters

An agent that self-corrects is more autonomous and less burdensome on the developer. When the agent notices a test failure, a type error, or a logical mistake and fixes it before the human has to intervene, it reduces iteration depth and messages per PR while maintaining quality.

Self-correction rate is a measure of agent autonomy and reliability. High self-correction rates mean the developer can trust the agent to catch and fix its own mistakes, freeing them to focus on higher-level direction rather than error detection.

## How It's Calculated

### Current implementation

AX approximates self-correction using the ratio of successful to failed Bash commands across all sessions correlated to a PR:

```
self_correction_rate = bash_successes / (bash_successes + bash_errors)
```

The intuition: if the agent encounters errors but ultimately gets most commands to succeed, it's self-correcting along the way. A rate of 0.85 means 85% of Bash commands succeeded — the agent recovered from the other 15% without human help.

Returns a value between 0.0 and 1.0. If there are no errors at all, the metric is omitted (nothing to self-correct).

### Future refinement

A more granular approach would parse the session transcript to classify each correction as agent-initiated vs human-requested:

- **Self-correction:** The agent ran a tool, observed a failure, and fixed it — all without an intervening human message.
- **Human-requested correction:** A human message prompted the fix (e.g., "that's not right", "fix the test").

This would give a truer measure of autonomy but requires fine-grained message ordering data that isn't yet available in the aggregated session format.

## Interpreting Values

- **Good:** Self-correction rates above 60% indicate the agent is proactively catching and fixing its mistakes. The agent is running tests, reading error output, and iterating without needing human intervention for routine issues.
- **Concerning:** Self-correction rates below 30% suggest the agent either is not running checks after making changes or is not responding to failure outputs. The human is doing the quality-control work that the agent should be doing. Investigate whether the agent is configured to run tests/builds after code changes.
- **Ambiguity:** A very high self-correction rate (above 90%) could mean the agent is catching everything on its own (good), or it could mean the agent is making many errors and fixing them through brute-force iteration (less good). Cross-reference with Error Recovery Efficiency and Iteration Depth. If the agent self-corrects often but takes many attempts to do so, the self-correction behavior is present but inefficient.

## Data Sources Required

- **Claude Code session data** — Full message transcripts including tool calls and their outputs, with role annotations. Specifically need:
  - Tool call results (test runs, build outputs, lint results) to detect failures.
  - File edit sequences to detect when the agent modifies previously-written code.
  - Message roles to determine whether corrections were prompted by humans.

## Phase

**Phase 2** — Requires Claude Code session data ingestion.
