# Iteration Depth

## What It Measures

The number of back-and-forth turn pairs between the user and the agent within a Claude Code session. A turn pair consists of one user message followed by the agent's response. Iteration depth captures how many conversational rounds were needed to reach the desired outcome.

## Why It Matters

Iteration depth reveals the conversational cost of completing a task. While Messages per PR counts raw human inputs, Iteration Depth specifically tracks the ping-pong pattern of user-agent interaction. High iteration depth suggests the agent needed repeated guidance, corrections, or clarifications — each round adding latency and cognitive overhead for the developer.

Reducing iteration depth is one of the most direct ways to improve agentic coding efficiency. It rewards clear prompting, effective planning, and agent configurations that produce correct results earlier in the conversation.

## How It's Calculated

1. Identify all Claude Code sessions associated with a task or PR.
2. Within each session, identify turn pairs: a user message followed by one or more assistant messages before the next user message.
3. Count the number of turn pairs per session.
4. Optionally aggregate across sessions for a PR-level view.

```
turn_pairs = 0
for i, message in enumerate(session.messages):
    if message.role == "user":
        # Check that the agent responded (not just consecutive user messages)
        if any(m.role == "assistant" for m in session.messages[i+1:next_user_index]):
            turn_pairs += 1

iteration_depth = turn_pairs
```

A single-shot interaction (one prompt, one response, done) has an iteration depth of 1.

## Interpreting Values

- **Good:** An iteration depth of 1-3 for typical feature PRs indicates the agent is executing effectively with minimal back-and-forth. Single-shot completions (depth = 1) represent the ideal for well-scoped tasks.
- **Concerning:** Iteration depths above 5-7 for straightforward tasks suggest something is off — the prompt may be ambiguous, the agent may be struggling with the codebase, or the task scope may be too large for a single session. Consistently high depths across a team warrant investigation into prompting practices.
- **Ambiguity:** Some tasks genuinely require iterative refinement — exploratory coding, complex debugging, or design discussions where the developer intentionally uses the agent as a thinking partner. High iteration depth in these cases is expected and not a quality concern. Categorize tasks by type (implementation, debugging, exploration) before comparing depths.

## Data Sources Required

- **Claude Code session data** — Full message transcripts with role annotations and message ordering.
- **Session-to-PR correlation** — For PR-level aggregation, a mapping between sessions and PRs.

## Phase

**Phase 2** — Requires Claude Code session data ingestion.
