# Re-Read Rate

## What It Measures

The ratio of total file reads to unique files read across sessions correlated to a PR. A value of 1.0 means every file was read exactly once; higher values indicate files were read multiple times.

## Why It Matters

When the model re-reads the same file multiple times in a session, it typically means one of: the file is too large to retain in context, the model lost track of information it read earlier, or the task required revisiting the same code repeatedly.

Re-reading burns tokens without adding new information. While some re-reading is normal (checking a file after modifying it), excessive re-reading suggests the model's context management could be improved — for instance, by providing better summaries in CLAUDE.md, using partial reads with offset/limit, or keeping files smaller.

## How It's Calculated

```
re_read_rate = total_file_reads / unique_files_read
```

Where `total_file_reads` counts every Read tool invocation and `unique_files_read` counts distinct file paths read (already tracked as `files_read_count`). Summed across all correlated sessions. Returns null if no files were read.

## Data Sources Required

- **Claude Code session data** — Count of Read tool invocations (total) and unique file paths read.
