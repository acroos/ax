// Package api defines the data types for the AX server API.
package api

import (
	"database/sql"

	"github.com/austinroos/ax/internal/db"
)

// PushPayload is the data sent from a developer's CLI to the team server.
type PushPayload struct {
	RepoPath   string           `json:"repo_path"`
	RemoteURL  string           `json:"remote_url"`
	Owner      string           `json:"owner"`
	Repo       string           `json:"repo"`
	PRs        []PRData         `json:"prs"`
	Commits    []CommitData     `json:"commits"`
	Sessions   []SessionData    `json:"sessions"`
	SessionPRs []SessionPRData  `json:"session_prs"`
	PRMetrics  []PRMetricsData  `json:"pr_metrics"`
	RepoMetrics *RepoMetricsData `json:"repo_metrics,omitempty"`
}

// PushResponse is returned by the server after processing a push.
type PushResponse struct {
	OK       bool           `json:"ok"`
	Entities map[string]int `json:"entities"`
	Error    string         `json:"error,omitempty"`
}

// PRData represents a PR in the push payload (JSON-friendly, no sql.Null types).
type PRData struct {
	Number       int     `json:"number"`
	Title        string  `json:"title,omitempty"`
	Branch       string  `json:"branch,omitempty"`
	State        string  `json:"state,omitempty"`
	CreatedAt    string  `json:"created_at,omitempty"`
	MergedAt     string  `json:"merged_at,omitempty"`
	ClosedAt     string  `json:"closed_at,omitempty"`
	URL          string  `json:"url,omitempty"`
	Additions    int     `json:"additions"`
	Deletions    int     `json:"deletions"`
	ChangedFiles int     `json:"changed_files"`
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
	ID                       string  `json:"id"`
	Branch                   string  `json:"branch,omitempty"`
	StartedAt                int64   `json:"started_at,omitempty"`
	EndedAt                  int64   `json:"ended_at,omitempty"`
	MessageCount             int     `json:"message_count"`
	TurnCount                int     `json:"turn_count"`
	InputTokens              int     `json:"input_tokens"`
	OutputTokens             int     `json:"output_tokens"`
	CacheCreationInputTokens int     `json:"cache_creation_input_tokens"`
	CacheReadInputTokens     int     `json:"cache_read_input_tokens"`
	TotalCostUSD             float64 `json:"total_cost_usd"`
	PrimaryModel             string  `json:"primary_model,omitempty"`
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

// --- Conversion functions ---

// PRFromDB converts a db.PR to a PRData for the API.
func PRFromDB(pr *db.PR) PRData {
	return PRData{
		Number:       pr.Number,
		Title:        pr.Title.String,
		Branch:       pr.Branch.String,
		State:        pr.State.String,
		CreatedAt:    pr.CreatedAt.String,
		MergedAt:     pr.MergedAt.String,
		ClosedAt:     pr.ClosedAt.String,
		URL:          pr.URL.String,
		Additions:    pr.Additions,
		Deletions:    pr.Deletions,
		ChangedFiles: pr.ChangedFiles,
	}
}

// PRToDB converts a PRData to a db.PR for storage.
func PRToDB(data PRData, repoID int64) *db.PR {
	return &db.PR{
		RepoID:       repoID,
		Number:       data.Number,
		Title:        nullStr(data.Title),
		Branch:       nullStr(data.Branch),
		State:        nullStr(data.State),
		CreatedAt:    nullStr(data.CreatedAt),
		MergedAt:     nullStr(data.MergedAt),
		ClosedAt:     nullStr(data.ClosedAt),
		URL:          nullStr(data.URL),
		Additions:    data.Additions,
		Deletions:    data.Deletions,
		ChangedFiles: data.ChangedFiles,
	}
}

// SessionFromDB converts a db.Session to a SessionData for the API.
func SessionFromDB(s *db.Session) SessionData {
	return SessionData{
		ID:                       s.ID,
		Branch:                   s.Branch.String,
		StartedAt:                s.StartedAt.Int64,
		EndedAt:                  s.EndedAt.Int64,
		MessageCount:             s.MessageCount,
		TurnCount:                s.TurnCount,
		InputTokens:              s.InputTokens,
		OutputTokens:             s.OutputTokens,
		CacheCreationInputTokens: s.CacheCreationInputTokens,
		CacheReadInputTokens:     s.CacheReadInputTokens,
		TotalCostUSD:             s.TotalCostUSD.Float64,
		PrimaryModel:             s.PrimaryModel.String,
	}
}

// PRMetricsFromDB converts a db.PRMetrics to a PRMetricsData for the API.
func PRMetricsFromDB(m *db.PRMetrics, prNumber int) PRMetricsData {
	d := PRMetricsData{
		PRNumber:         prNumber,
		MetricsFinalized: m.MetricsFinalized,
		FinalizedAt:      m.FinalizedAt.String,
	}
	if m.MessagesPerPR.Valid {
		v := int(m.MessagesPerPR.Int64)
		d.MessagesPerPR = &v
	}
	if m.IterationDepth.Valid {
		v := int(m.IterationDepth.Int64)
		d.IterationDepth = &v
	}
	if m.PostOpenCommits.Valid {
		v := int(m.PostOpenCommits.Int64)
		d.PostOpenCommits = &v
	}
	if m.FirstPassAccepted.Valid {
		v := int(m.FirstPassAccepted.Int64)
		d.FirstPassAccepted = &v
	}
	if m.CISuccessRate.Valid {
		d.CISuccessRate = &m.CISuccessRate.Float64
	}
	if m.DiffChurnLines.Valid {
		v := int(m.DiffChurnLines.Int64)
		d.DiffChurnLines = &v
	}
	if m.HasTests.Valid {
		v := int(m.HasTests.Int64)
		d.HasTests = &v
	}
	if m.LineRevisitRate.Valid {
		d.LineRevisitRate = &m.LineRevisitRate.Float64
	}
	if m.SelfCorrectionRate.Valid {
		d.SelfCorrectionRate = &m.SelfCorrectionRate.Float64
	}
	if m.ContextEfficiency.Valid {
		d.ContextEfficiency = &m.ContextEfficiency.Float64
	}
	if m.ErrorRecoveryAttempts.Valid {
		v := int(m.ErrorRecoveryAttempts.Int64)
		d.ErrorRecoveryAttempts = &v
	}
	if m.TokenCostUSD.Valid {
		d.TokenCostUSD = &m.TokenCostUSD.Float64
	}
	if m.PlanCoverageScore.Valid {
		d.PlanCoverageScore = &m.PlanCoverageScore.Float64
	}
	if m.PlanDeviationScore.Valid {
		d.PlanDeviationScore = &m.PlanDeviationScore.Float64
	}
	if m.ScopeCreepDetected.Valid {
		v := int(m.ScopeCreepDetected.Int64)
		d.ScopeCreepDetected = &v
	}
	return d
}

// PRMetricsToDB converts a PRMetricsData to a db.PRMetrics for storage.
func PRMetricsToDB(data PRMetricsData, prID int64) *db.PRMetrics {
	m := &db.PRMetrics{
		PRID:             prID,
		MetricsFinalized: data.MetricsFinalized,
		FinalizedAt:      nullStr(data.FinalizedAt),
	}
	if data.MessagesPerPR != nil {
		m.MessagesPerPR = sql.NullInt64{Int64: int64(*data.MessagesPerPR), Valid: true}
	}
	if data.IterationDepth != nil {
		m.IterationDepth = sql.NullInt64{Int64: int64(*data.IterationDepth), Valid: true}
	}
	if data.PostOpenCommits != nil {
		m.PostOpenCommits = sql.NullInt64{Int64: int64(*data.PostOpenCommits), Valid: true}
	}
	if data.FirstPassAccepted != nil {
		m.FirstPassAccepted = sql.NullInt64{Int64: int64(*data.FirstPassAccepted), Valid: true}
	}
	if data.CISuccessRate != nil {
		m.CISuccessRate = sql.NullFloat64{Float64: *data.CISuccessRate, Valid: true}
	}
	if data.DiffChurnLines != nil {
		m.DiffChurnLines = sql.NullInt64{Int64: int64(*data.DiffChurnLines), Valid: true}
	}
	if data.HasTests != nil {
		m.HasTests = sql.NullInt64{Int64: int64(*data.HasTests), Valid: true}
	}
	if data.LineRevisitRate != nil {
		m.LineRevisitRate = sql.NullFloat64{Float64: *data.LineRevisitRate, Valid: true}
	}
	if data.SelfCorrectionRate != nil {
		m.SelfCorrectionRate = sql.NullFloat64{Float64: *data.SelfCorrectionRate, Valid: true}
	}
	if data.ContextEfficiency != nil {
		m.ContextEfficiency = sql.NullFloat64{Float64: *data.ContextEfficiency, Valid: true}
	}
	if data.ErrorRecoveryAttempts != nil {
		m.ErrorRecoveryAttempts = sql.NullInt64{Int64: int64(*data.ErrorRecoveryAttempts), Valid: true}
	}
	if data.TokenCostUSD != nil {
		m.TokenCostUSD = sql.NullFloat64{Float64: *data.TokenCostUSD, Valid: true}
	}
	if data.PlanCoverageScore != nil {
		m.PlanCoverageScore = sql.NullFloat64{Float64: *data.PlanCoverageScore, Valid: true}
	}
	if data.PlanDeviationScore != nil {
		m.PlanDeviationScore = sql.NullFloat64{Float64: *data.PlanDeviationScore, Valid: true}
	}
	if data.ScopeCreepDetected != nil {
		m.ScopeCreepDetected = sql.NullInt64{Int64: int64(*data.ScopeCreepDetected), Valid: true}
	}
	return m
}

func nullStr(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}
