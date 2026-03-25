package db

import "database/sql"

// Repo represents a tracked git repository.
type Repo struct {
	ID           int64          `db:"id"`
	Path         string         `db:"path"`
	RemoteURL    sql.NullString `db:"remote_url"`
	GithubOwner  sql.NullString `db:"github_owner"`
	GithubRepo   sql.NullString `db:"github_repo"`
	LastSyncedAt sql.NullString `db:"last_synced_at"`
	CreatedAt    string         `db:"created_at"`
}

// PR represents a GitHub pull request.
type PR struct {
	ID           int64          `db:"id"`
	RepoID       int64          `db:"repo_id"`
	Number       int            `db:"number"`
	Title        sql.NullString `db:"title"`
	Branch       sql.NullString `db:"branch"`
	State        sql.NullString `db:"state"`
	CreatedAt    sql.NullString `db:"created_at"`
	MergedAt     sql.NullString `db:"merged_at"`
	ClosedAt     sql.NullString `db:"closed_at"`
	URL          sql.NullString `db:"url"`
	Additions    int            `db:"additions"`
	Deletions    int            `db:"deletions"`
	ChangedFiles int            `db:"changed_files"`
}

// Commit represents a git commit associated with a repo and optionally a PR.
type Commit struct {
	SHA             string         `db:"sha"`
	RepoID          int64          `db:"repo_id"`
	PRID            sql.NullInt64  `db:"pr_id"`
	SessionID       sql.NullString `db:"session_id"`
	Message         sql.NullString `db:"message"`
	Author          sql.NullString `db:"author"`
	CommittedAt     sql.NullString `db:"committed_at"`
	IsClaudeAuthored int           `db:"is_claude_authored"`
	IsPostOpen       int           `db:"is_post_open"`
	Additions        int           `db:"additions"`
	Deletions        int           `db:"deletions"`
	FilesChanged     int           `db:"files_changed"`
}

// Session represents a Claude Code session.
type Session struct {
	ID                       string          `db:"id"`
	RepoID                   sql.NullInt64   `db:"repo_id"`
	Branch                   sql.NullString  `db:"branch"`
	StartedAt                sql.NullInt64   `db:"started_at"`
	EndedAt                  sql.NullInt64   `db:"ended_at"`
	MessageCount             int             `db:"message_count"`
	TurnCount                int             `db:"turn_count"`
	CWD                      sql.NullString  `db:"cwd"`
	InputTokens              int             `db:"input_tokens"`
	OutputTokens             int             `db:"output_tokens"`
	CacheCreationInputTokens int             `db:"cache_creation_input_tokens"`
	CacheReadInputTokens     int             `db:"cache_read_input_tokens"`
	TotalCostUSD             sql.NullFloat64 `db:"total_cost_usd"`
	PrimaryModel             sql.NullString  `db:"primary_model"`
}

// SessionPR represents the correlation between a session and a PR.
type SessionPR struct {
	SessionID  string `db:"session_id"`
	PRID       int64  `db:"pr_id"`
	Confidence string `db:"confidence"`
}

// PRMetrics stores computed metrics for a single PR.
type PRMetrics struct {
	PRID                  int64           `db:"pr_id"`
	MessagesPerPR         sql.NullInt64   `db:"messages_per_pr"`
	IterationDepth        sql.NullInt64   `db:"iteration_depth"`
	PostOpenCommits       sql.NullInt64   `db:"post_open_commits"`
	FirstPassAccepted     sql.NullInt64   `db:"first_pass_accepted"`
	CISuccessRate         sql.NullFloat64 `db:"ci_success_rate"`
	DiffChurnLines        sql.NullInt64   `db:"diff_churn_lines"`
	HasTests              sql.NullInt64   `db:"has_tests"`
	LineRevisitRate       sql.NullFloat64 `db:"line_revisit_rate"`
	PlanCoverageScore     sql.NullFloat64 `db:"plan_coverage_score"`
	PlanDeviationScore    sql.NullFloat64 `db:"plan_deviation_score"`
	ScopeCreepDetected    sql.NullInt64   `db:"scope_creep_detected"`
	SelfCorrectionRate    sql.NullFloat64 `db:"self_correction_rate"`
	ContextEfficiency     sql.NullFloat64 `db:"context_efficiency"`
	ErrorRecoveryAttempts sql.NullInt64   `db:"error_recovery_attempts"`
	TokenCostUSD          sql.NullFloat64 `db:"token_cost_usd"`
	ComputedAt            string          `db:"computed_at"`
}

// RepoMetrics stores aggregate metrics for a repository over a time period.
type RepoMetrics struct {
	ID              int64           `db:"id"`
	RepoID          int64           `db:"repo_id"`
	PeriodStart     string          `db:"period_start"`
	PeriodEnd       string          `db:"period_end"`
	PeriodType      string          `db:"period_type"`
	TotalSessions   int             `db:"total_sessions"`
	TotalTokens     int             `db:"total_tokens"`
	TotalCostUSD    float64         `db:"total_cost_usd"`
	UnmergedTokens  int             `db:"unmerged_tokens"`
	UnmergedCostUSD float64         `db:"unmerged_cost_usd"`
	UnmergedRate    sql.NullFloat64 `db:"unmerged_rate"`
	ComputedAt      string          `db:"computed_at"`
}
