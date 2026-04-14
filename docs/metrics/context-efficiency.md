# Context Efficiency

## What It Measures

The ratio of files the agent reads or searches versus the files it actually modifies. This metric tracks how many files appear in Read, Glob, and Grep tool calls compared to how many files appear in Edit and Write tool calls within a session. It measures how efficiently the agent gathers context before making changes.

## Why It Matters

Agents that read many files but modify few may be struggling to find the right context, exploring the codebase aimlessly, or consuming tokens on files that are not relevant to the task. Conversely, agents that modify files without reading related code may be making changes without sufficient context, leading to integration issues.

Context efficiency helps teams understand the agent's exploration behavior and identify opportunities to improve it — better initial prompts, curated context in plans, or project-level configuration that helps the agent find relevant files faster.

## How It's Calculated

### Current implementation

AX computes context efficiency as the ratio of files modified to files read across all sessions correlated to a PR:

```
context_efficiency = unique_files_modified / unique_files_read
```

A value of **0.25** means the agent modified 1 file for every 4 it read — it needed to explore broadly to make focused changes. A value of **1.0** means it modified exactly as many files as it read — highly targeted.

Returns a value between 0.0 and 1.0+ (values above 1.0 are possible if the agent creates new files without reading existing ones). If no files were read, the metric is omitted.

> 💡 **Reading the number:** Lower values = more exploration. Higher values = more focused. Neither is inherently good or bad — it depends on the task.

### How file counts are gathered

The CLI session parser counts unique file paths from tool calls:
- **Files read:** Paths from `Read`, `Glob`, `Grep` tool calls
- **Files modified:** Paths from `Edit`, `Write` tool calls

These counts are sent to the server as `files_read_count` and `files_modified_count` per session.

## Interpreting Values

- **Good:** Ratios between 2:1 and 5:1 are typical for productive sessions. The agent reads a reasonable number of files to understand the codebase context and then makes focused changes. The exact ideal depends on the task — a bug fix in a well-understood area may only need 1:1, while a cross-cutting refactor may need 10:1.
- **Concerning:** Ratios above 15:1 suggest the agent is reading extensively but modifying very little — it may be lost, struggling with the task, or exploring files that are not relevant. Ratios below 1:1 (modifying more files than it reads) suggest the agent is making changes without reading enough context, which often leads to integration errors.
- **Ambiguity:** This metric is highly task-dependent. Debugging sessions legitimately involve reading many files to locate a bug, resulting in high ratios that do not indicate inefficiency. Code generation tasks where the agent creates new files may show low ratios since it is writing more than reading. Compare context efficiency across similar task types, not across all sessions indiscriminately. Also, some read operations are more valuable than others — reading the right file once is better than skimming ten irrelevant files.

## Data Sources Required

- **Claude Code session data** — Tool call records including:
  - Tool name (Read, Glob, Grep, Edit, Write, etc.)
  - Tool parameters (file paths being read or modified)
  - Tool call ordering and timestamps

## Phase

**Phase 2** — Requires Claude Code session data ingestion.
