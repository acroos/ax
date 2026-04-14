// Package api defines the data types for the AX server API.
package api

// PushPayload is the data sent from a developer's CLI to the AX server.
type PushPayload struct {
	RepoPath    string           `json:"repo_path,omitempty"`
	RemoteURL   string           `json:"remote_url,omitempty"`
	Owner       string           `json:"owner"`
	Repo        string           `json:"repo"`
	PRs         []PRData         `json:"prs,omitempty"`
	Commits     []CommitData     `json:"commits,omitempty"`
	Sessions    []SessionData    `json:"sessions"`
	SessionPRs  []SessionPRData  `json:"session_prs,omitempty"`
	PRMetrics   []PRMetricsData  `json:"pr_metrics,omitempty"`
	RepoMetrics *RepoMetricsData `json:"repo_metrics,omitempty"`
}

// PushResponse is returned by the server after processing a push.
type PushResponse struct {
	OK       bool           `json:"ok"`
	Entities map[string]int `json:"entities"`
	Error    string         `json:"error,omitempty"`
}

// PRData represents a PR in the push payload.
type PRData struct {
	Number       int    `json:"number"`
	Title        string `json:"title,omitempty"`
	Branch       string `json:"branch,omitempty"`
	State        string `json:"state,omitempty"`
	CreatedAt    string `json:"created_at,omitempty"`
	MergedAt     string `json:"merged_at,omitempty"`
	ClosedAt     string `json:"closed_at,omitempty"`
	URL          string `json:"url,omitempty"`
	Additions    int    `json:"additions"`
	Deletions    int    `json:"deletions"`
	ChangedFiles int    `json:"changed_files"`
}

// CommitData represents a commit in the push payload.
type CommitData struct {
	SHA              string `json:"sha"`
	PRNumber         int    `json:"pr_number,omitempty"`
	Message          string `json:"message,omitempty"`
	Author           string `json:"author,omitempty"`
	CommittedAt      string `json:"committed_at,omitempty"`
	IsClaudeAuthored bool   `json:"is_claude_authored"`
	IsPostOpen       bool   `json:"is_post_open"`
	Additions        int    `json:"additions"`
	Deletions        int    `json:"deletions"`
	FilesChanged     int    `json:"files_changed"`
}

// SessionData represents a Claude Code session in the push payload.
type SessionData struct {
	ID                       string   `json:"id"`
	Branch                   string   `json:"branch,omitempty"`
	StartedAt                int64    `json:"started_at,omitempty"`
	EndedAt                  int64    `json:"ended_at,omitempty"`
	MessageCount             int      `json:"message_count"`
	TurnCount                int      `json:"turn_count"`
	InputTokens              int      `json:"input_tokens"`
	OutputTokens             int      `json:"output_tokens"`
	CacheCreationInputTokens int      `json:"cache_creation_input_tokens"`
	CacheReadInputTokens     int      `json:"cache_read_input_tokens"`
	TotalCostUSD             float64  `json:"total_cost_usd"`
	PrimaryModel             string   `json:"primary_model,omitempty"`
	BashErrors               int      `json:"bash_errors"`
	BashSuccesses            int      `json:"bash_successes"`
	FilesReadCount           int      `json:"files_read_count"`
	FilesModifiedCount       int      `json:"files_modified_count"`
	PlannedFiles             []string `json:"planned_files,omitempty"`
	AssistantMessageCount    int      `json:"assistant_message_count"`
	SidechainMessages        int      `json:"sidechain_messages"`
	TotalFileReads           int      `json:"total_file_reads"`
}

// SessionPRData represents a session-to-PR correlation.
type SessionPRData struct {
	SessionID  string `json:"session_id"`
	PRNumber   int    `json:"pr_number"`
	Confidence string `json:"confidence"`
}

// PRMetricsData represents computed metrics for a PR.
type PRMetricsData struct {
	PRNumber              int      `json:"pr_number"`
	MessagesPerPR         *int     `json:"messages_per_pr,omitempty"`
	IterationDepth        *int     `json:"iteration_depth,omitempty"`
	PostOpenCommits       *int     `json:"post_open_commits,omitempty"`
	FirstPassAccepted     *int     `json:"first_pass_accepted,omitempty"`
	CISuccessRate         *float64 `json:"ci_success_rate,omitempty"`
	DiffChurnLines        *int     `json:"diff_churn_lines,omitempty"`
	HasTests              *int     `json:"has_tests,omitempty"`
	LineRevisitRate       *float64 `json:"line_revisit_rate,omitempty"`
	SelfCorrectionRate    *float64 `json:"self_correction_rate,omitempty"`
	ContextEfficiency     *float64 `json:"context_efficiency,omitempty"`
	ErrorRecoveryAttempts *int     `json:"error_recovery_attempts,omitempty"`
	TokenCostUSD          *float64 `json:"token_cost_usd,omitempty"`
	PlanCoverageScore     *float64 `json:"plan_coverage_score,omitempty"`
	PlanDeviationScore    *float64 `json:"plan_deviation_score,omitempty"`
	ScopeCreepDetected    *int     `json:"scope_creep_detected,omitempty"`
	MetricsFinalized      int      `json:"metrics_finalized"`
	FinalizedAt           string   `json:"finalized_at,omitempty"`
}

// RepoMetricsData represents aggregate metrics for a repo.
type RepoMetricsData struct {
	PeriodStart     string  `json:"period_start"`
	PeriodEnd       string  `json:"period_end"`
	PeriodType      string  `json:"period_type"`
	TotalSessions   int     `json:"total_sessions"`
	TotalTokens     int     `json:"total_tokens"`
	TotalCostUSD    float64 `json:"total_cost_usd"`
	UnmergedTokens  int     `json:"unmerged_tokens"`
	UnmergedCostUSD float64 `json:"unmerged_cost_usd"`
	UnmergedRate    float64 `json:"unmerged_rate"`
}
