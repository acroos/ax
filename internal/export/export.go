// Package export provides machine-readable data extraction for ax.
// It supports JSON, JSONL, and CSV output formats with filtering.
package export

import (
	"database/sql"
	"fmt"

	"github.com/austinroos/ax/internal/db"
)

// Options controls what data is exported and how.
type Options struct {
	RepoID        int64
	AllRepos      bool
	PRNumber      int
	Since         string // YYYY-MM-DD
	Until         string // YYYY-MM-DD
	FinalizedOnly bool
	Aggregate     bool
	Format        string // "json", "jsonl", "csv"
	Output        string // file path, empty for stdout
}

// Row is a single exported PR with clean types (no sql.Null wrappers).
type Row struct {
	Repo         string   `json:"repo"`
	PRNumber     int      `json:"pr_number"`
	Title        string   `json:"title"`
	State        string   `json:"state"`
	CreatedAt    string   `json:"created_at,omitempty"`
	MergedAt     string   `json:"merged_at,omitempty"`
	Additions    int      `json:"additions"`
	Deletions    int      `json:"deletions"`
	ChangedFiles int      `json:"changed_files"`
	Metrics      Metrics  `json:"metrics"`
}

// Metrics holds exported metric values with pointer types for clean null handling.
type Metrics struct {
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

// AggregateRow is an exported repo-level metrics summary.
type AggregateRow struct {
	Repo            string  `json:"repo"`
	TotalSessions   int     `json:"total_sessions"`
	TotalTokens     int     `json:"total_tokens"`
	TotalCostUSD    float64 `json:"total_cost_usd"`
	UnmergedTokens  int     `json:"unmerged_tokens"`
	UnmergedCostUSD float64 `json:"unmerged_cost_usd"`
	UnmergedRate    float64 `json:"unmerged_rate"`
}

// ExtractRows reads PR data from the database and returns export rows.
func ExtractRows(database db.DBTX, opts Options) ([]Row, error) {
	var repos []db.Repo

	if opts.AllRepos {
		var err error
		repos, err = db.ListRepos(database)
		if err != nil {
			return nil, err
		}
	} else if opts.RepoID > 0 {
		var repo db.Repo
		err := database.Get(&repo, "SELECT * FROM repos WHERE id = ?", opts.RepoID)
		if err != nil {
			return nil, fmt.Errorf("repo not found: %w", err)
		}
		repos = []db.Repo{repo}
	}

	var rows []Row
	for _, repo := range repos {
		repoName := repo.Path
		if repo.GithubOwner.Valid && repo.GithubRepo.Valid {
			repoName = repo.GithubOwner.String + "/" + repo.GithubRepo.String
		}

		var prs []db.PR
		if opts.PRNumber > 0 {
			var pr db.PR
			err := database.Get(&pr, "SELECT * FROM prs WHERE repo_id = ? AND number = ?", repo.ID, opts.PRNumber)
			if err != nil {
				continue
			}
			prs = []db.PR{pr}
		} else if opts.FinalizedOnly {
			var err error
			prs, err = db.GetFinalizedPRsForRepo(database, repo.ID)
			if err != nil {
				continue
			}
		} else {
			var err error
			prs, err = db.GetPRsForRepo(database, repo.ID)
			if err != nil {
				continue
			}
		}

		for _, pr := range prs {
			// Apply date filters
			if opts.Since != "" && pr.CreatedAt.Valid && pr.CreatedAt.String < opts.Since {
				continue
			}
			if opts.Until != "" && pr.CreatedAt.Valid && pr.CreatedAt.String > opts.Until {
				continue
			}

			m, _ := db.GetPRMetrics(database, pr.ID)

			row := Row{
				Repo:         repoName,
				PRNumber:     pr.Number,
				Title:        pr.Title.String,
				State:        pr.State.String,
				CreatedAt:    pr.CreatedAt.String,
				MergedAt:     pr.MergedAt.String,
				Additions:    pr.Additions,
				Deletions:    pr.Deletions,
				ChangedFiles: pr.ChangedFiles,
			}

			if m != nil {
				row.Metrics = metricsFromDB(m)
			}

			rows = append(rows, row)
		}
	}

	return rows, nil
}

// ExtractAggregates reads repo-level metrics from the database.
func ExtractAggregates(database db.DBTX, opts Options) ([]AggregateRow, error) {
	var repos []db.Repo

	if opts.AllRepos {
		var err error
		repos, err = db.ListRepos(database)
		if err != nil {
			return nil, err
		}
	} else if opts.RepoID > 0 {
		var repo db.Repo
		err := database.Get(&repo, "SELECT * FROM repos WHERE id = ?", opts.RepoID)
		if err != nil {
			return nil, fmt.Errorf("repo not found: %w", err)
		}
		repos = []db.Repo{repo}
	}

	var rows []AggregateRow
	for _, repo := range repos {
		repoName := repo.Path
		if repo.GithubOwner.Valid && repo.GithubRepo.Valid {
			repoName = repo.GithubOwner.String + "/" + repo.GithubRepo.String
		}

		metrics, err := db.GetRepoMetrics(database, repo.ID, "all")
		if err != nil || len(metrics) == 0 {
			continue
		}

		rm := metrics[0]
		rows = append(rows, AggregateRow{
			Repo:            repoName,
			TotalSessions:   rm.TotalSessions,
			TotalTokens:     rm.TotalTokens,
			TotalCostUSD:    rm.TotalCostUSD,
			UnmergedTokens:  rm.UnmergedTokens,
			UnmergedCostUSD: rm.UnmergedCostUSD,
			UnmergedRate:    rm.UnmergedRate.Float64,
		})
	}

	return rows, nil
}

func metricsFromDB(m *db.PRMetrics) Metrics {
	var em Metrics

	if m.PostOpenCommits.Valid {
		v := int(m.PostOpenCommits.Int64)
		em.PostOpenCommits = &v
	}
	if m.FirstPassAccepted.Valid {
		v := m.FirstPassAccepted.Int64 == 1
		em.FirstPassAccepted = &v
	}
	if m.CISuccessRate.Valid {
		em.CISuccessRate = &m.CISuccessRate.Float64
	}
	if m.HasTests.Valid {
		v := m.HasTests.Int64 == 1
		em.HasTests = &v
	}
	if m.DiffChurnLines.Valid {
		v := int(m.DiffChurnLines.Int64)
		em.DiffChurnLines = &v
	}
	if m.LineRevisitRate.Valid {
		em.LineRevisitRate = &m.LineRevisitRate.Float64
	}
	if m.MessagesPerPR.Valid {
		v := int(m.MessagesPerPR.Int64)
		em.MessagesPerPR = &v
	}
	if m.IterationDepth.Valid {
		v := int(m.IterationDepth.Int64)
		em.IterationDepth = &v
	}
	if m.SelfCorrectionRate.Valid {
		em.SelfCorrectionRate = &m.SelfCorrectionRate.Float64
	}
	if m.ContextEfficiency.Valid {
		em.ContextEfficiency = &m.ContextEfficiency.Float64
	}
	if m.ErrorRecoveryAttempts.Valid {
		v := int(m.ErrorRecoveryAttempts.Int64)
		em.ErrorRecoveryAttempts = &v
	}
	if m.TokenCostUSD.Valid {
		em.TokenCostUSD = &m.TokenCostUSD.Float64
	}
	if m.PlanCoverageScore.Valid {
		em.PlanCoverageScore = &m.PlanCoverageScore.Float64
	}
	if m.PlanDeviationScore.Valid {
		em.PlanDeviationScore = &m.PlanDeviationScore.Float64
	}
	if m.ScopeCreepDetected.Valid {
		v := m.ScopeCreepDetected.Int64 == 1
		em.ScopeCreepDetected = &v
	}

	return em
}

// suppress unused import warning
var _ = sql.ErrNoRows
