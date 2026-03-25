# AX Metrics Reference

This document provides an overview of all metrics tracked by AX to measure agentic coding effectiveness. Metrics are organized into four categories and implemented across three build phases.

## Metric Categories

### Prompt Efficiency

Metrics that measure how effectively prompts translate into completed work with minimal back-and-forth.

### Output Quality

Metrics that measure whether agent-generated code meets quality standards on the first attempt.

### Planning Effectiveness

Metrics that measure how well upfront planning translates into predictable implementation.

### Agent Behavior

Metrics that measure how efficiently the agent operates — how it reads, writes, recovers from errors, and self-corrects.

---

## All Metrics

| # | Metric | Category | Brief Description | Data Sources | Phase |
|---|--------|----------|-------------------|--------------|-------|
| 1 | [Messages per PR](./messages-per-pr.md) | Prompt Efficiency | Number of human messages in Claude Code sessions correlated to a PR | Session data | 2 |
| 2 | [Iteration Depth](./iteration-depth.md) | Prompt Efficiency | Count of back-and-forth turn pairs (user to agent) per task | Session data | 2 |
| 3 | [Post-Open Commits](./post-open-commits.md) | Output Quality | Commits landing after a PR was opened | Git, GitHub API | 1 |
| 4 | [First-Pass Acceptance Rate](./first-pass-acceptance-rate.md) | Output Quality | Percentage of PRs merged without reviewer change requests | GitHub Reviews API | 1 |
| 5 | [CI Success Rate](./ci-success-rate.md) | Output Quality | Percentage of commits/PRs passing CI on first push | GitHub Status Checks | 1 |
| 6 | [Diff Churn](./diff-churn.md) | Output Quality | Lines written then rewritten before merge — wasted effort signal | Git | 1 |
| 7 | [Test Coverage of Generated Code](./test-coverage-of-generated-code.md) | Output Quality | Whether PRs include corresponding test file changes | Git diff | 1 |
| 8 | [Line Revisit Rate](./line-revisit-rate.md) | Output Quality | How often the same lines are modified across different PRs | Git blame/diff | 1 |
| 9 | [Plan-to-Implementation Coverage](./plan-to-implementation-coverage.md) | Planning Effectiveness | How much of the final implementation was captured in the plan | Plan files, Git diff | 3 |
| 10 | [Plan Deviation Score](./plan-deviation-score.md) | Planning Effectiveness | Files planned vs files actually changed | Plan files, Git diff | 3 |
| 11 | [Scope Creep Detection](./scope-creep-detection.md) | Planning Effectiveness | Changes beyond what was originally asked for | Plan files, Git diff | 3 |
| 12 | [Self-Correction Rate](./self-correction-rate.md) | Agent Behavior | Agent-initiated fixes vs human-requested changes | Session data | 2 |
| 13 | [Context Efficiency](./context-efficiency.md) | Agent Behavior | Ratio of files read vs files modified | Session data | 2 |
| 14 | [Error Recovery Efficiency](./error-recovery-efficiency.md) | Agent Behavior | Attempts needed to resolve build/test/lint failures | Session data | 2 |

---

## Build Phases

### Phase 1 — Git and GitHub Data

Metrics that can be calculated from git history and the GitHub API alone. These require no session data or plan files and are the first to be implemented.

**Metrics:** Post-Open Commits, First-Pass Acceptance Rate, CI Success Rate, Diff Churn, Test Coverage of Generated Code, Line Revisit Rate

### Phase 2 — Session Data

Metrics that require access to Claude Code session logs (message transcripts, tool call records). These depend on a session data ingestion pipeline.

**Metrics:** Messages per PR, Iteration Depth, Self-Correction Rate, Context Efficiency, Error Recovery Efficiency

### Phase 3 — Plan Files

Metrics that compare plan documents against actual implementation. These require a structured planning workflow and plan file format.

**Metrics:** Plan-to-Implementation Coverage, Plan Deviation Score, Scope Creep Detection

---

## Deferred Metrics

The following metrics were considered but deferred from the initial metric set. They may be revisited in future iterations:

- **Time-to-Merge** — Wall-clock time from PR open to merge. Deferred because it conflates human review latency with agent quality, making it unreliable as an agent effectiveness signal without normalization.
- **Token Usage per PR** — Total tokens consumed across session(s) for a PR. Deferred because raw token counts are noisy without context about task complexity; may be revisited once a task-complexity baseline exists.
- **Human Edit Rate** — Percentage of agent-generated lines that humans subsequently modify. Deferred due to difficulty distinguishing style preference edits from correctness fixes without manual classification.
- **PR Size Distribution** — Lines of code changed per PR. Useful as a normalizing dimension but not independently actionable as a quality signal. May be added as a supporting dimension rather than a standalone metric.
