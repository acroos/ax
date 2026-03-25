package db

import (
	"database/sql"
	"fmt"

	"github.com/jmoiron/sqlx"
)

// UpsertRepo inserts or updates a repo, returning its ID.
func UpsertRepo(db *sqlx.DB, path, remoteURL, owner, repo string) (int64, error) {
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
func GetRepoByPath(db *sqlx.DB, path string) (*Repo, error) {
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
func ListRepos(db *sqlx.DB) ([]Repo, error) {
	var repos []Repo
	err := db.Select(&repos, "SELECT * FROM repos ORDER BY path")
	if err != nil {
		return nil, fmt.Errorf("failed to list repos: %w", err)
	}
	return repos, nil
}

// UpsertPR inserts or updates a pull request.
func UpsertPR(db *sqlx.DB, pr *PR) (int64, error) {
	result, err := db.Exec(`
		INSERT INTO prs (repo_id, number, title, branch, state, created_at, merged_at, closed_at, url, additions, deletions, changed_files)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(repo_id, number) DO UPDATE SET
			title = excluded.title,
			branch = excluded.branch,
			state = excluded.state,
			created_at = excluded.created_at,
			merged_at = excluded.merged_at,
			closed_at = excluded.closed_at,
			url = excluded.url,
			additions = excluded.additions,
			deletions = excluded.deletions,
			changed_files = excluded.changed_files
	`, pr.RepoID, pr.Number, pr.Title, pr.Branch, pr.State,
		pr.CreatedAt, pr.MergedAt, pr.ClosedAt, pr.URL,
		pr.Additions, pr.Deletions, pr.ChangedFiles)
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
func UpsertCommit(db *sqlx.DB, c *Commit) error {
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
func UpsertPRMetrics(db *sqlx.DB, m *PRMetrics) error {
	_, err := db.Exec(`
		INSERT INTO pr_metrics (pr_id, messages_per_pr, iteration_depth, post_open_commits, first_pass_accepted,
			ci_success_rate, diff_churn_lines, has_tests, line_revisit_rate, plan_coverage_score,
			plan_deviation_score, scope_creep_detected, self_correction_rate, context_efficiency,
			error_recovery_attempts, token_cost_usd, computed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(pr_id) DO UPDATE SET
			messages_per_pr = excluded.messages_per_pr,
			iteration_depth = excluded.iteration_depth,
			post_open_commits = excluded.post_open_commits,
			first_pass_accepted = excluded.first_pass_accepted,
			ci_success_rate = excluded.ci_success_rate,
			diff_churn_lines = excluded.diff_churn_lines,
			has_tests = excluded.has_tests,
			line_revisit_rate = excluded.line_revisit_rate,
			plan_coverage_score = excluded.plan_coverage_score,
			plan_deviation_score = excluded.plan_deviation_score,
			scope_creep_detected = excluded.scope_creep_detected,
			self_correction_rate = excluded.self_correction_rate,
			context_efficiency = excluded.context_efficiency,
			error_recovery_attempts = excluded.error_recovery_attempts,
			token_cost_usd = excluded.token_cost_usd,
			computed_at = datetime('now')
	`, m.PRID, m.MessagesPerPR, m.IterationDepth, m.PostOpenCommits, m.FirstPassAccepted,
		m.CISuccessRate, m.DiffChurnLines, m.HasTests, m.LineRevisitRate,
		m.PlanCoverageScore, m.PlanDeviationScore, m.ScopeCreepDetected,
		m.SelfCorrectionRate, m.ContextEfficiency, m.ErrorRecoveryAttempts, m.TokenCostUSD)
	if err != nil {
		return fmt.Errorf("failed to upsert PR metrics: %w", err)
	}
	return nil
}

// GetPRsForRepo returns all PRs for a given repo.
func GetPRsForRepo(db *sqlx.DB, repoID int64) ([]PR, error) {
	var prs []PR
	err := db.Select(&prs, "SELECT * FROM prs WHERE repo_id = ? ORDER BY number DESC", repoID)
	if err != nil {
		return nil, fmt.Errorf("failed to get PRs: %w", err)
	}
	return prs, nil
}

// GetPRMetrics returns computed metrics for a PR.
func GetPRMetrics(db *sqlx.DB, prID int64) (*PRMetrics, error) {
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
func UpdateRepoSyncTime(db *sqlx.DB, repoID int64) error {
	_, err := db.Exec("UPDATE repos SET last_synced_at = datetime('now') WHERE id = ?", repoID)
	if err != nil {
		return fmt.Errorf("failed to update sync time: %w", err)
	}
	return nil
}

// ComputeTokenCostForPR sums total_cost_usd from all sessions correlated to a PR.
// Returns 0 if no sessions are correlated or none have cost data.
func ComputeTokenCostForPR(db *sqlx.DB, prID int64) (float64, error) {
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
func UpsertRepoMetrics(db *sqlx.DB, m *RepoMetrics) error {
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
			computed_at = datetime('now')
	`, m.RepoID, m.PeriodStart, m.PeriodEnd, m.PeriodType,
		m.TotalSessions, m.TotalTokens, m.TotalCostUSD,
		m.UnmergedTokens, m.UnmergedCostUSD, m.UnmergedRate)
	if err != nil {
		return fmt.Errorf("failed to upsert repo metrics: %w", err)
	}
	return nil
}

// GetRepoMetrics returns repo-level metrics for a given period type.
func GetRepoMetrics(db *sqlx.DB, repoID int64, periodType string) ([]RepoMetrics, error) {
	var metrics []RepoMetrics
	err := db.Select(&metrics,
		"SELECT * FROM repo_metrics WHERE repo_id = ? AND period_type = ? ORDER BY period_start DESC",
		repoID, periodType)
	if err != nil {
		return nil, fmt.Errorf("failed to get repo metrics: %w", err)
	}
	return metrics, nil
}
