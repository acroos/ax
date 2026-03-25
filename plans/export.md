## Implementation Plan: `ax export` Command

### 1. Overview

The `ax export` command provides machine-readable data extraction from AX's SQLite database (or remote server in team mode). It supports CSV, JSON, and JSONL output formats with filtering by repo, date range, PR state, and metric thresholds. Output goes to stdout by default for piping, or to a file via `--output`.

### 2. CLI Flag Design (Cobra)

The command should be registered in `cmd/ax/main.go` via `root.AddCommand(newExportCmd())` alongside the existing commands.

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--format` | string | `"json"` | Output format: `csv`, `json`, `jsonl` |
| `--repo` | string | `""` | Path to repo (resolves via `resolveRepoPath`). Mutually exclusive with `--all-repos`. |
| `--all-repos` | bool | `false` | Export data from all tracked repos |
| `--pr` | int | `0` | Export metrics for a single PR |
| `--aggregate` | bool | `false` | Export repo-level aggregate metrics (from `repo_metrics` table) |
| `--since` | string | `""` | Only include PRs created after this date (YYYY-MM-DD) |
| `--until` | string | `""` | Only include PRs created before this date (YYYY-MM-DD) |
| `--state` | string | `""` | Filter by PR state: `merged`, `closed`, or `all` (default: finalized PRs only) |
| `--metric` | []string | `[]` | Restrict output to specific metric columns (e.g., `token_cost_usd,post_open_commits`) |
| `--output` | string | `""` | Write to file instead of stdout |
| `--finalized-only` | bool | `true` | Only export PRs with finalized metrics (default true, use `--finalized-only=false` for in-flight) |

**Validation rules:**
- `--repo` and `--all-repos` are mutually exclusive. If neither is specified, default to current directory (same pattern as `ax sync`).
- `--aggregate` changes the output shape to repo-level metrics (from `repo_metrics` table) rather than per-PR metrics.
- `--metric` values must match column names in the `PRMetrics` struct. Invalid names produce an error listing valid options.
- `--since`/`--until` must be valid YYYY-MM-DD strings.

### 3. Output Format Implementations

All output must be clean and machine-readable. No decorative prefixes, no status messages to stdout. Status/progress messages (if any) go to stderr.

#### 3a. JSON

A single JSON array containing all matching rows. For per-PR exports, each object contains PR metadata plus metrics fields. Structure:

```json
[
  {
    "repo": "owner/name",
    "pr_number": 42,
    "title": "Add feature",
    "state": "merged",
    "created_at": "2026-01-15T...",
    "merged_at": "2026-01-16T...",
    "additions": 150,
    "deletions": 30,
    "changed_files": 5,
    "metrics": {
      "post_open_commits": 2,
      "first_pass_accepted": false,
      "ci_success_rate": 0.85,
      "token_cost_usd": 4.32,
      ...
    }
  }
]
```

Implementation: Build a slice of export structs, then `json.NewEncoder(writer).Encode(rows)`. Use `json.MarshalIndent` when writing to a TTY (detected via `os.IsTerminal`), compact JSON otherwise for piping.

#### 3b. JSONL

One JSON object per line. Same object structure as JSON, but each record is a separate line. This is the preferred format for streaming/large datasets.

Implementation: Iterate over results, `json.Marshal` each row individually, write with `\n`. This allows constant memory usage regardless of dataset size.

#### 3c. CSV

Flat columns. Nested metrics are flattened to column names like `post_open_commits`, `ci_success_rate`, etc. PR metadata columns come first, then metric columns in a stable order.

Column order: `repo,pr_number,title,state,created_at,merged_at,additions,deletions,changed_files,post_open_commits,first_pass_accepted,ci_success_rate,has_tests,diff_churn_lines,line_revisit_rate,messages_per_pr,iteration_depth,self_correction_rate,context_efficiency,error_recovery_attempts,token_cost_usd,plan_coverage_score,plan_deviation_score,scope_creep_detected`

When `--metric` is specified, only those metric columns are included (PR metadata columns are always present).

Implementation: Use Go's `encoding/csv` writer. Null metric values are rendered as empty string (not "null" or "0").

### 4. Data Extraction

#### 4a. Local mode (default)

New query functions in `internal/db/queries.go`:

- `ExportPRsWithMetrics(db, opts ExportOptions) ([]ExportRow, error)` -- A single JOIN query combining `prs`, `pr_metrics`, and `repos` tables with WHERE clauses constructed from filter options. This is the core query for per-PR exports.

- `ExportRepoAggregates(db, opts ExportOptions) ([]RepoMetrics, error)` -- Query `repo_metrics` table for `--aggregate` mode.

The `ExportOptions` struct:

```go
type ExportOptions struct {
    RepoID        int64    // 0 means all repos
    PRNumber      int      // 0 means all PRs
    Since         string   // YYYY-MM-DD, empty means no lower bound
    Until         string   // YYYY-MM-DD, empty means no upper bound
    State         string   // "merged", "closed", "all", empty means finalized only
    FinalizedOnly bool
    Metrics       []string // empty means all metrics
}
```

The query builds dynamic WHERE clauses:
- `p.repo_id = ?` when RepoID is set
- `p.created_at >= ?` for `--since`
- `p.created_at <= ?` for `--until`
- `p.state = ?` for `--state merged/closed`
- `pm.metrics_finalized = 1` when FinalizedOnly is true

#### 4b. Team/server mode (future-proofing)

Server mode is not yet implemented (`ax server` and `ax push` are planned). The export command should detect team mode by checking for `AX_SERVER_URL` environment variable (consistent with the planned ingestion architecture from the phase-1 plan). When set, export fetches data via HTTP GET from the server's API rather than local SQLite.

For Phase 1, implement local-only. Structure the code so data retrieval is behind an interface:

```go
type ExportDataSource interface {
    FetchPRs(opts ExportOptions) ([]ExportRow, error)
    FetchAggregates(opts ExportOptions) ([]AggregateRow, error)
}
```

With two implementations: `LocalDataSource` (SQLite, implemented now) and `ServerDataSource` (HTTP, stubbed/deferred).

### 5. Export Data Types

Define clean export types separate from the internal `sql.Null*` types. These are the serialization boundary:

```go
// ExportRow is the per-PR export record with clean types (no sql.Null wrappers).
type ExportRow struct {
    Repo         string   `json:"repo"`
    PRNumber     int      `json:"pr_number"`
    Title        string   `json:"title"`
    State        string   `json:"state"`
    CreatedAt    string   `json:"created_at"`
    MergedAt     string   `json:"merged_at,omitempty"`
    Additions    int      `json:"additions"`
    Deletions    int      `json:"deletions"`
    ChangedFiles int      `json:"changed_files"`
    Metrics      ExportMetrics `json:"metrics"`
}

type ExportMetrics struct {
    PostOpenCommits       *int     `json:"post_open_commits,omitempty"`
    FirstPassAccepted     *bool    `json:"first_pass_accepted,omitempty"`
    CISuccessRate         *float64 `json:"ci_success_rate,omitempty"`
    HasTests              *bool    `json:"has_tests,omitempty"`
    DiffChurnLines        *int     `json:"diff_churn_lines,omitempty"`
    LineRevisitRate       *float64 `json:"line_revisit_rate,omitempty"`
    MessagesPerPR         *int     `json:"messages_per_pr,omitempty"`
    IterationDepth        *int     `json:"iteration_depth,omitempty"`
    SelfCorrectionRate    *float64 `json:"self_correction_rate,omitempty"`
    ContextEfficiency     *float64 `json:"context_efficiency,omitempty"`
    ErrorRecoveryAttempts *int     `json:"error_recovery_attempts,omitempty"`
    TokenCostUSD          *float64 `json:"token_cost_usd,omitempty"`
    PlanCoverageScore     *float64 `json:"plan_coverage_score,omitempty"`
    PlanDeviationScore    *float64 `json:"plan_deviation_score,omitempty"`
    ScopeCreepDetected    *bool    `json:"scope_creep_detected,omitempty"`
}
```

Conversion from `db.PRMetrics` (with `sql.Null*` types) to `ExportMetrics` (with `*type` pointers) happens in a mapping function. This keeps the export layer clean and prevents leaking database nullability into the serialization format.

### 6. Streaming for Large Datasets

For JSONL and CSV formats, use streaming output: write each row as it is produced rather than buffering the entire result set. This is straightforward since both formats are line-oriented.

For JSON format, the entire array must be buffered in memory since it needs `[...]` wrapper. For very large datasets, the documentation should recommend JSONL.

Implementation pattern:
1. Open writer (stdout or file based on `--output`)
2. Execute query, iterate rows
3. For each row: convert `sql.Null*` to export type, serialize, write
4. Flush and close

Use `bufio.Writer` wrapping the output for efficiency.

### 7. Suppressing Non-Data Output

The `ax report` command prints decorative formatting (`\n  METRIC\tVALUE\t...`). The export command must never do this. All human-readable messages (like "Exporting 42 PRs..." or error context) go to stderr via `fmt.Fprintf(os.Stderr, ...)`. Stdout contains only the data payload.

### 8. File Organization

New files to create:

| File | Purpose |
|------|---------|
| `internal/export/export.go` | Core export logic: `ExportDataSource` interface, `ExportRow`/`ExportMetrics` types, conversion from DB models |
| `internal/export/format.go` | Format writers: `WriteJSON`, `WriteJSONL`, `WriteCSV` functions |
| `internal/export/format_test.go` | Tests for format serialization |
| `internal/export/local.go` | `LocalDataSource` implementation (SQLite queries) |
| `internal/export/local_test.go` | Tests for local data extraction |

Files to modify:

| File | Change |
|------|--------|
| `cmd/ax/main.go` | Add `newExportCmd()` function, register with `root.AddCommand` |
| `internal/db/queries.go` | Add `ExportPRsWithMetrics` and `ExportRepoAggregates` query functions |

### 9. Implementation Phases

**Phase 1: Core export with JSON (1 session)**
- Create `internal/export/` package with types and `LocalDataSource`
- Add `ExportPRsWithMetrics` query to `internal/db/queries.go`
- Implement JSON formatter
- Wire up `newExportCmd()` in `cmd/ax/main.go` with `--format json`, `--repo`, `--all-repos`, `--output`
- Test with `ax export --repo . --format json`

**Phase 2: CSV and JSONL + filtering (1 session)**
- Add CSV and JSONL formatters
- Implement `--since`, `--until`, `--state`, `--finalized-only` filters
- Implement `--metric` column selection (for CSV, filters columns; for JSON/JSONL, filters metric fields)
- Add `--pr` for single-PR export

**Phase 3: Aggregate export + polish (half session)**
- Implement `--aggregate` flag querying `repo_metrics` table
- Add stderr progress messages for large exports
- Edge case handling: empty results, repos with no metrics, invalid filter combinations

**Phase 4: Server mode (deferred until `ax server` exists)**
- Implement `ServerDataSource` using HTTP client
- Detect `AX_SERVER_URL` env var to switch data source
- Same flags, same output -- different backend

### 10. Design Decisions

1. **Separate `internal/export/` package rather than inline in main.go**: The export logic (type conversion, formatting, filtering) is substantial enough to warrant its own package. It also makes it testable without needing cobra.

2. **Clean export types vs. reusing `db.PRMetrics`**: The `sql.Null*` wrappers produce ugly JSON (`{"Int64": 5, "Valid": true}`). Export types use Go pointers (`*int`, `*float64`) which serialize cleanly to `5` or `null`.

3. **Default to finalized-only**: Consistent with `ax report` which only shows finalized PRs. In-flight metrics are provisional and would confuse downstream tools.

4. **JSON as default format (not CSV)**: JSON preserves types (numbers vs strings) and handles null values cleanly. CSV requires convention for nulls and loses nested structure. JSON is also what `jq` expects.

5. **No `--pretty` flag**: Auto-detect TTY via `os.IsTerminal(os.Stdout.Fd())`. Pretty-print when interactive, compact when piped. Follows `jq` convention.

### Critical Files for Implementation
- `/Users/austinroos/dev/ax/cmd/ax/main.go` - Add `newExportCmd()` cobra command registration and flag wiring
- `/Users/austinroos/dev/ax/internal/db/queries.go` - Add `ExportPRsWithMetrics` query joining prs + pr_metrics + repos with dynamic filtering
- `/Users/austinroos/dev/ax/internal/db/models.go` - Reference for all data model types (`PR`, `PRMetrics`, `RepoMetrics`) that export types map from
- `/Users/austinroos/dev/ax/internal/export/export.go` - New file: core export types, `ExportDataSource` interface, `sql.Null*` to pointer conversion
- `/Users/austinroos/dev/ax/internal/export/format.go` - New file: JSON/JSONL/CSV format writers with streaming support
