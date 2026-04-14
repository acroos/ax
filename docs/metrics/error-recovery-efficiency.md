# Error Recovery Efficiency

## What It Measures

The number of attempts the agent needs to resolve build, test, or lint failures. This metric detects failed-then-retry sequences in a session — where the agent runs a check (build, test, lint), it fails, the agent makes changes, and runs the check again. The count of attempts before success (or abandonment) measures how efficiently the agent recovers from errors.

## Why It Matters

Error recovery is one of the most token-intensive and time-consuming parts of agentic coding. An agent that fixes a test failure on the first retry is far more efficient than one that takes five attempts, each consuming tokens and developer attention. Poor error recovery often manifests as the agent making changes that introduce new failures, fix one issue but break another, or repeatedly attempt the same unsuccessful approach.

Tracking this metric helps identify whether the agent is an effective debugger or whether certain classes of errors consistently stump it, suggesting the developer should intervene earlier or provide more context.

## How It's Calculated

### Current implementation

AX counts the total number of **Bash command errors** across all sessions correlated to a PR:

```
error_recovery_attempts = SUM(session.bash_errors) for each correlated session
```

A value of **3** means the agent hit 3 Bash errors across all sessions for this PR. Lower is better — it means the agent got things right without trial-and-error cycles.

This is a simple but effective proxy: more Bash errors = more time spent recovering from mistakes, regardless of whether the agent ultimately succeeded.

### Future refinement

A more granular approach would detect retry *sequences* — a failure followed by code changes followed by the same check — and compute:

- **Average attempts to resolve:** Mean number of check runs before success
- **Resolution rate:** Percentage of failure sequences the agent resolves on its own
- **First-retry success rate:** Percentage of failures fixed on the very first retry

This would distinguish between "hit one error and moved on" and "thrashed for five attempts on the same test."

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
