# Self-Correction Rate

## What It Measures

The proportion of error corrections in a session that were initiated by the agent versus requested by the human. This metric distinguishes between the agent detecting and fixing its own mistakes (self-correction) and the human having to point out errors and ask for fixes (human-requested correction).

## Why It Matters

An agent that self-corrects is more autonomous and less burdensome on the developer. When the agent notices a test failure, a type error, or a logical mistake and fixes it before the human has to intervene, it reduces iteration depth and messages per PR while maintaining quality.

Self-correction rate is a measure of agent autonomy and reliability. High self-correction rates mean the developer can trust the agent to catch and fix its own mistakes, freeing them to focus on higher-level direction rather than error detection.

## How It's Calculated

1. Parse the session transcript to identify correction sequences — places where the agent modifies code it previously wrote.
2. Classify each correction:
   - **Self-correction:** The agent ran a tool (test, build, lint), observed a failure, and made changes to fix the issue — all without an intervening human message. The pattern is: agent writes code, agent runs a check, check fails, agent fixes the code.
   - **Human-requested correction:** The human sends a message indicating something is wrong (e.g., "that's not right," "fix the test," "there's a bug in..."), and the agent then makes changes.
3. Calculate the rate.

```
corrections = []
for i, message in enumerate(session.messages):
    if is_correction(message):  # agent modifying previously-written code
        # Look backward: was there a human message requesting this fix?
        preceding_messages = session.messages[last_agent_action:i]
        if any(m.role == "user" for m in preceding_messages):
            corrections.append("human_requested")
        else:
            corrections.append("self_correction")

self_correction_rate = (
    corrections.count("self_correction") / len(corrections) * 100
)
```

Detecting corrections requires identifying when the agent modifies files it previously edited in the same session, particularly after running a tool that returned an error or failure output.

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
