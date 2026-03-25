# Error Recovery Efficiency

## What It Measures

The number of attempts the agent needs to resolve build, test, or lint failures. This metric detects failed-then-retry sequences in a session — where the agent runs a check (build, test, lint), it fails, the agent makes changes, and runs the check again. The count of attempts before success (or abandonment) measures how efficiently the agent recovers from errors.

## Why It Matters

Error recovery is one of the most token-intensive and time-consuming parts of agentic coding. An agent that fixes a test failure on the first retry is far more efficient than one that takes five attempts, each consuming tokens and developer attention. Poor error recovery often manifests as the agent making changes that introduce new failures, fix one issue but break another, or repeatedly attempt the same unsuccessful approach.

Tracking this metric helps identify whether the agent is an effective debugger or whether certain classes of errors consistently stump it, suggesting the developer should intervene earlier or provide more context.

## How It's Calculated

1. Parse the session transcript for tool calls that run checks (test commands, build commands, lint commands).
2. Identify check results as pass or fail based on tool output (exit codes, error messages, test result summaries).
3. Detect retry sequences: a failure followed by code changes followed by the same type of check.
4. Count the number of attempts (runs of the same check type) before either success or the sequence ending.

```
check_tool_patterns = ["npm test", "npm run build", "npm run lint", "cargo test", "pytest", ...]

sequences = []
current_sequence = None

for tool_call in session.tool_calls:
    if is_check_command(tool_call):
        if tool_call.exit_code != 0:  # failure
            if current_sequence is None:
                current_sequence = {"type": tool_call.check_type, "attempts": 1}
            else:
                current_sequence["attempts"] += 1
        else:  # success
            if current_sequence is not None:
                current_sequence["resolved"] = True
                current_sequence["attempts"] += 1  # the successful attempt
                sequences.append(current_sequence)
                current_sequence = None

# Average attempts to resolve
resolved = [s for s in sequences if s["resolved"]]
avg_attempts = mean(s["attempts"] for s in resolved)

# Resolution rate
resolution_rate = len(resolved) / len(sequences) * 100
```

Key sub-metrics:
- **Average attempts to resolve:** Mean number of check runs before success.
- **Resolution rate:** Percentage of failure sequences the agent eventually resolves (vs. giving up or the human taking over).
- **First-retry success rate:** Percentage of failures fixed on the very first retry.

## Interpreting Values

- **Good:** Average attempts of 1.5-2.5 indicates the agent typically fixes errors on the first or second retry. A first-retry success rate above 60% shows the agent is diagnosing issues correctly most of the time. A resolution rate above 80% means the agent can handle most errors it encounters.
- **Concerning:** Average attempts above 4 suggests the agent is thrashing — trying approaches that do not work, possibly making things worse. A resolution rate below 50% means the agent frequently cannot fix errors on its own, requiring human intervention. Investigate which types of errors are most problematic (type errors? test failures? build configuration?) to identify targeted improvements.
- **Ambiguity:** Some errors are genuinely hard to fix — intermittent test failures, complex type system issues, or environment-specific problems. A single difficult error recovery can skew the average. Consider reporting the median alongside the mean. Also, the agent may "resolve" a failure by deleting the failing test or skipping the check, which counts as recovery but is not desirable. Pair with Test Coverage and CI Success Rate to catch this pattern.

## Data Sources Required

- **Claude Code session data** — Tool call records including:
  - Shell/Bash commands executed (to identify check commands)
  - Command exit codes or output content (to classify pass/fail)
  - Ordering of tool calls (to detect failure-edit-retry sequences)
  - File edit operations between check runs (to confirm the agent attempted a fix)

## Phase

**Phase 2** — Requires Claude Code session data ingestion.
