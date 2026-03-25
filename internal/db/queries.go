package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// DBTX is an interface satisfied by both *sqlx.DB and *sqlx.Tx,
// allowing query functions to work in both transactional and non-transactional contexts.
type DBTX interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
	Get(dest interface{}, query string, args ...interface{}) error
	Select(dest interface{}, query string, args ...interface{}) error
	Rebind(query string) string
}

// UpsertRepo inserts or updates a repo, returning its ID.
func UpsertRepo(db DBTX, path, remoteURL, owner, repo string) (int64, error) {
	result, err := db.Exec(`
		INSERT INTO repos (path, remote_url, github_owner, github_repo)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			remote_url = excluded.remote_url,
			github_owner = excluded.github_owner,
			github_repo = excluded.github_repo
	`, path, remoteURL, owner, repo)
	if err != nil {
		return 0, fmt.Errorf("failed to upsert repo: %w", err)
	}

	// If it was an update, we need to get the existing ID
	id, err := result.LastInsertId()
	if err != nil || id == 0 {
		var existingID int64
		err = db.Get(&existingID, "SELECT id FROM repos WHERE path = ?", path)
		if err != nil {
			return 0, fmt.Errorf("failed to get repo ID: %w", err)
		}
		return existingID, nil
	}
	return id, nil
}

// GetRepoByPath returns a repo by its filesystem path.
func GetRepoByPath(db DBTX, path string) (*Repo, error) {
	var repo Repo
	err := db.Get(&repo, "SELECT * FROM repos WHERE path = ?", path)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get repo: %w", err)
	}
	return &repo, nil
}

// ListRepos returns all tracked repositories.
func ListRepos(db DBTX) ([]Repo, error) {
	var repos []Repo
	err := db.Select(&repos, "SELECT * FROM repos ORDER BY path")
	if err != nil {
		return nil, fmt.Errorf("failed to list repos: %w", err)
	}
	return repos, nil
}

// UpsertPR inserts or updates a pull request, tracking state transitions.
func UpsertPR(db DBTX, pr *PR) (int64, error) {
	result, err := db.Exec(`
		INSERT INTO prs (repo_id, number, title, branch, state, created_at, merged_at, closed_at, url, additions, deletions, changed_files, author)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(repo_id, number) DO UPDATE SET
			title = excluded.title,
			branch = excluded.branch,
			previous_state = prs.state,
			state = excluded.state,
			created_at = excluded.created_at,
			merged_at = excluded.merged_at,
			closed_at = excluded.closed_at,
			url = excluded.url,
			additions = excluded.additions,
			deletions = excluded.deletions,
			changed_files = excluded.changed_files,
			author = COALESCE(excluded.author, prs.author)
	`, pr.RepoID, pr.Number, pr.Title, pr.Branch, pr.State,
		pr.CreatedAt, pr.MergedAt, pr.ClosedAt, pr.URL,
		pr.Additions, pr.Deletions, pr.ChangedFiles, pr.Author)
	if err != nil {
		return 0, fmt.Errorf("failed to upsert PR: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil || id == 0 {
		var existingID int64
		err = db.Get(&existingID, "SELECT id FROM prs WHERE repo_id = ? AND number = ?", pr.RepoID, pr.Number)
		if err != nil {
			return 0, fmt.Errorf("failed to get PR ID: %w", err)
		}
		return existingID, nil
	}
	return id, nil
}

// UpsertCommit inserts or updates a commit.
func UpsertCommit(db DBTX, c *Commit) error {
	_, err := db.Exec(`
		INSERT INTO commits (sha, repo_id, pr_id, session_id, message, author, committed_at, is_claude_authored, is_post_open, additions, deletions, files_changed)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(sha) DO UPDATE SET
			pr_id = COALESCE(excluded.pr_id, commits.pr_id),
			session_id = COALESCE(excluded.session_id, commits.session_id),
			is_claude_authored = excluded.is_claude_authored,
			is_post_open = excluded.is_post_open
	`, c.SHA, c.RepoID, c.PRID, c.SessionID, c.Message, c.Author,
		c.CommittedAt, c.IsClaudeAuthored, c.IsPostOpen,
		c.Additions, c.Deletions, c.FilesChanged)
	if err != nil {
		return fmt.Errorf("failed to upsert commit: %w", err)
	}
	return nil
}

// UpsertPRMetrics inserts or replaces metrics for a PR.
// If the PR's metrics are already finalized, this is a no-op.
func UpsertPRMetrics(db DBTX, m *PRMetrics) error {
	_, err := db.Exec(`
		INSERT INTO pr_metrics (pr_id, messages_per_pr, iteration_depth, post_open_commits, first_pass_accepted,
			ci_success_rate, diff_churn_lines, has_tests, line_revisit_rate, plan_coverage_score,
			plan_deviation_score, scope_creep_detected, self_correction_rate, context_efficiency,
			error_recovery_attempts, token_cost_usd, metrics_finalized, finalized_at, computed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(pr_id) DO UPDATE SET
			messages_per_pr = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.messages_per_pr ELSE excluded.messages_per_pr END,
			iteration_depth = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.iteration_depth ELSE excluded.iteration_depth END,
			post_open_commits = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.post_open_commits ELSE excluded.post_open_commits END,
			first_pass_accepted = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.first_pass_accepted ELSE excluded.first_pass_accepted END,
			ci_success_rate = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.ci_success_rate ELSE excluded.ci_success_rate END,
			diff_churn_lines = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.diff_churn_lines ELSE excluded.diff_churn_lines END,
			has_tests = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.has_tests ELSE excluded.has_tests END,
			line_revisit_rate = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.line_revisit_rate ELSE excluded.line_revisit_rate END,
			plan_coverage_score = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.plan_coverage_score ELSE excluded.plan_coverage_score END,
			plan_deviation_score = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.plan_deviation_score ELSE excluded.plan_deviation_score END,
			scope_creep_detected = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.scope_creep_detected ELSE excluded.scope_creep_detected END,
			self_correction_rate = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.self_correction_rate ELSE excluded.self_correction_rate END,
			context_efficiency = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.context_efficiency ELSE excluded.context_efficiency END,
			error_recovery_attempts = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.error_recovery_attempts ELSE excluded.error_recovery_attempts END,
			token_cost_usd = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.token_cost_usd ELSE excluded.token_cost_usd END,
			metrics_finalized = CASE WHEN pr_metrics.metrics_finalized = 1 THEN 1 ELSE excluded.metrics_finalized END,
			finalized_at = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.finalized_at ELSE excluded.finalized_at END,
			computed_at = CASE WHEN pr_metrics.metrics_finalized = 1 THEN pr_metrics.computed_at ELSE CURRENT_TIMESTAMP END
	`, m.PRID, m.MessagesPerPR, m.IterationDepth, m.PostOpenCommits, m.FirstPassAccepted,
		m.CISuccessRate, m.DiffChurnLines, m.HasTests, m.LineRevisitRate,
		m.PlanCoverageScore, m.PlanDeviationScore, m.ScopeCreepDetected,
		m.SelfCorrectionRate, m.ContextEfficiency, m.ErrorRecoveryAttempts, m.TokenCostUSD,
		m.MetricsFinalized, m.FinalizedAt)
	if err != nil {
		return fmt.Errorf("failed to upsert PR metrics: %w", err)
	}
	return nil
}

// IsPRFinalized returns true if a PR's metrics have been finalized.
func IsPRFinalized(db DBTX, prID int64) (bool, error) {
	var finalized int
	err := db.Get(&finalized, "SELECT COALESCE(metrics_finalized, 0) FROM pr_metrics WHERE pr_id = ?", prID)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to check finalization: %w", err)
	}
	return finalized == 1, nil
}

// GetFinalizedPRsForRepo returns only PRs with finalized metrics for a repo.
func GetFinalizedPRsForRepo(db DBTX, repoID int64) ([]PR, error) {
	var prs []PR
	err := db.Select(&prs, `
		SELECT p.* FROM prs p
		INNER JOIN pr_metrics m ON p.id = m.pr_id
		WHERE p.repo_id = ? AND m.metrics_finalized = 1
		ORDER BY p.number DESC
	`, repoID)
	if err != nil {
		return nil, fmt.Errorf("failed to get finalized PRs: %w", err)
	}
	return prs, nil
}

// UpsertWatchedRepo adds or updates a watched repo configuration.
func UpsertWatchedRepo(db DBTX, w *WatchedRepo) error {
	_, err := db.Exec(`
		INSERT INTO watched_repos (repo_id, poll_interval_seconds, enabled)
		VALUES (?, ?, ?)
		ON CONFLICT(repo_id) DO UPDATE SET
			poll_interval_seconds = excluded.poll_interval_seconds,
			enabled = excluded.enabled
	`, w.RepoID, w.PollIntervalSeconds, w.Enabled)
	if err != nil {
		return fmt.Errorf("failed to upsert watched repo: %w", err)
	}
	return nil
}

// GetEnabledWatchedRepos returns all enabled watched repos with their repo details.
func GetEnabledWatchedRepos(db DBTX) ([]WatchedRepo, error) {
	var repos []WatchedRepo
	err := db.Select(&repos, "SELECT * FROM watched_repos WHERE enabled = 1")
	if err != nil {
		return nil, fmt.Errorf("failed to get watched repos: %w", err)
	}
	return repos, nil
}

// UpdateWatchedRepoPolledAt updates the last_polled_at timestamp.
func UpdateWatchedRepoPolledAt(db DBTX, repoID int64) error {
	_, err := db.Exec("UPDATE watched_repos SET last_polled_at = CURRENT_TIMESTAMP WHERE repo_id = ?", repoID)
	if err != nil {
		return fmt.Errorf("failed to update polled time: %w", err)
	}
	return nil
}

// GetAllWatchedRepos returns all watched repos (for status display).
func GetAllWatchedRepos(db DBTX) ([]WatchedRepo, error) {
	var repos []WatchedRepo
	err := db.Select(&repos, "SELECT * FROM watched_repos")
	if err != nil {
		return nil, fmt.Errorf("failed to get watched repos: %w", err)
	}
	return repos, nil
}

// DeleteWatchedRepo removes a repo from the watch list.
func DeleteWatchedRepo(db DBTX, repoID int64) error {
	_, err := db.Exec("DELETE FROM watched_repos WHERE repo_id = ?", repoID)
	if err != nil {
		return fmt.Errorf("failed to delete watched repo: %w", err)
	}
	return nil
}

// --- API Key Management ---

// GenerateAPIKey creates a new API key, stores its bcrypt hash, and returns the raw key.
// The raw key is only available at creation time.
func GenerateAPIKey(db DBTX, name string) (string, error) {
	// Generate random key: ax_k1_ + 32 hex chars
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("failed to generate random key: %w", err)
	}
	key := "ax_k1_" + hex.EncodeToString(raw)

	hash, err := bcrypt.GenerateFromPassword([]byte(key), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash key: %w", err)
	}

	_, err = db.Exec(`
		INSERT INTO api_keys (key_hash, name) VALUES (?, ?)
	`, string(hash), name)
	if err != nil {
		return "", fmt.Errorf("failed to store API key: %w", err)
	}

	return key, nil
}

// ValidateAPIKey checks if a raw API key is valid (not revoked) and returns the key name.
func ValidateAPIKey(db DBTX, rawKey string) (string, error) {
	var keys []APIKey
	err := db.Select(&keys, "SELECT * FROM api_keys WHERE revoked = 0")
	if err != nil {
		return "", fmt.Errorf("failed to query API keys: %w", err)
	}

	for _, k := range keys {
		if err := bcrypt.CompareHashAndPassword([]byte(k.KeyHash), []byte(rawKey)); err == nil {
			// Update last_used_at
			db.Exec("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?", k.ID)
			return k.Name, nil
		}
	}

	return "", fmt.Errorf("invalid API key")
}

// ListAPIKeys returns all API keys (without hashes).
func ListAPIKeys(db DBTX) ([]APIKey, error) {
	var keys []APIKey
	err := db.Select(&keys, "SELECT id, '' as key_hash, name, created_at, last_used_at, revoked FROM api_keys ORDER BY created_at DESC")
	if err != nil {
		return nil, fmt.Errorf("failed to list API keys: %w", err)
	}
	return keys, nil
}

// RevokeAPIKey revokes an API key by name.
func RevokeAPIKey(db DBTX, name string) error {
	result, err := db.Exec("UPDATE api_keys SET revoked = 1 WHERE name = ? AND revoked = 0", name)
	if err != nil {
		return fmt.Errorf("failed to revoke API key: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("no active API key found with name %q", name)
	}
	return nil
}

// GetPRsForRepo returns all PRs for a given repo.
func GetPRsForRepo(db DBTX, repoID int64) ([]PR, error) {
	var prs []PR
	err := db.Select(&prs, "SELECT * FROM prs WHERE repo_id = ? ORDER BY number DESC", repoID)
	if err != nil {
		return nil, fmt.Errorf("failed to get PRs: %w", err)
	}
	return prs, nil
}

// GetPRMetrics returns computed metrics for a PR.
func GetPRMetrics(db DBTX, prID int64) (*PRMetrics, error) {
	var m PRMetrics
	err := db.Get(&m, "SELECT * FROM pr_metrics WHERE pr_id = ?", prID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get PR metrics: %w", err)
	}
	return &m, nil
}

// UpdateRepoSyncTime updates the last_synced_at timestamp for a repo.
func UpdateRepoSyncTime(db DBTX, repoID int64) error {
	_, err := db.Exec("UPDATE repos SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?", repoID)
	if err != nil {
		return fmt.Errorf("failed to update sync time: %w", err)
	}
	return nil
}

// ComputeTokenCostForPR sums total_cost_usd from all sessions correlated to a PR.
// Returns 0 if no sessions are correlated or none have cost data.
func ComputeTokenCostForPR(db DBTX, prID int64) (float64, error) {
	var cost sql.NullFloat64
	err := db.Get(&cost, `
		SELECT SUM(s.total_cost_usd)
		FROM sessions s
		JOIN session_prs sp ON s.id = sp.session_id
		WHERE sp.pr_id = ?
	`, prID)
	if err != nil {
		return 0, fmt.Errorf("failed to compute token cost for PR: %w", err)
	}
	if !cost.Valid {
		return 0, nil
	}
	return cost.Float64, nil
}

// UpsertRepoMetrics inserts or replaces repo-level metrics for a time period.
func UpsertRepoMetrics(db DBTX, m *RepoMetrics) error {
	_, err := db.Exec(`
		INSERT INTO repo_metrics (repo_id, period_start, period_end, period_type,
			total_sessions, total_tokens, total_cost_usd,
			unmerged_tokens, unmerged_cost_usd, unmerged_rate)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(repo_id, period_start, period_type) DO UPDATE SET
			period_end = excluded.period_end,
			total_sessions = excluded.total_sessions,
			total_tokens = excluded.total_tokens,
			total_cost_usd = excluded.total_cost_usd,
			unmerged_tokens = excluded.unmerged_tokens,
			unmerged_cost_usd = excluded.unmerged_cost_usd,
			unmerged_rate = excluded.unmerged_rate,
			computed_at = CURRENT_TIMESTAMP
	`, m.RepoID, m.PeriodStart, m.PeriodEnd, m.PeriodType,
		m.TotalSessions, m.TotalTokens, m.TotalCostUSD,
		m.UnmergedTokens, m.UnmergedCostUSD, m.UnmergedRate)
	if err != nil {
		return fmt.Errorf("failed to upsert repo metrics: %w", err)
	}
	return nil
}

// GetRepoMetrics returns repo-level metrics for a given period type.
func GetRepoMetrics(db DBTX, repoID int64, periodType string) ([]RepoMetrics, error) {
	var metrics []RepoMetrics
	err := db.Select(&metrics,
		"SELECT * FROM repo_metrics WHERE repo_id = ? AND period_type = ? ORDER BY period_start DESC",
		repoID, periodType)
	if err != nil {
		return nil, fmt.Errorf("failed to get repo metrics: %w", err)
	}
	return metrics, nil
}
