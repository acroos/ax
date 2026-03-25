# Context Efficiency

## What It Measures

The ratio of files the agent reads or searches versus the files it actually modifies. This metric tracks how many files appear in Read, Glob, and Grep tool calls compared to how many files appear in Edit and Write tool calls within a session. It measures how efficiently the agent gathers context before making changes.

## Why It Matters

Agents that read many files but modify few may be struggling to find the right context, exploring the codebase aimlessly, or consuming tokens on files that are not relevant to the task. Conversely, agents that modify files without reading related code may be making changes without sufficient context, leading to integration issues.

Context efficiency helps teams understand the agent's exploration behavior and identify opportunities to improve it — better initial prompts, curated context in plans, or project-level configuration that helps the agent find relevant files faster.

## How It's Calculated

1. Parse the session transcript for tool calls.
2. Categorize file interactions:
   - **Read operations:** Files appearing in `Read`, `Glob`, `Grep`, and similar context-gathering tool calls.
   - **Write operations:** Files appearing in `Edit`, `Write`, and similar file-modification tool calls.
3. Compute the ratio.

```
read_files = set()
write_files = set()

for tool_call in session.tool_calls:
    if tool_call.name in ["Read", "Glob", "Grep", "mcp__cclsp__find_definition", ...]:
        read_files.update(extract_file_paths(tool_call))
    elif tool_call.name in ["Edit", "Write"]:
        write_files.update(extract_file_paths(tool_call))

context_ratio = len(read_files) / len(write_files) if write_files else float('inf')
```

A ratio of 3:1 means the agent read three files for every file it modified.

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
