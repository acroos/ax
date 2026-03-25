// Package sync orchestrates data ingestion from git, GitHub, and Claude Code
// sessions, computing metrics and storing results in the database.
package sync

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"github.com/austinroos/ax/internal/db"
	"github.com/austinroos/ax/internal/metrics"
	"github.com/austinroos/ax/internal/parsers"
	"github.com/jmoiron/sqlx"
)

// Options controls what gets synced.
type Options struct {
	RepoPath string
	Since    string // YYYY-MM-DD filter
}

// Result contains a summary of what was synced.
type Result struct {
	RepoPath   string
	Owner      string
	Repo       string
	PRsSynced  int
	PRsFailed  int
	NewPRs     int
}

// Run performs a full sync for a repository: fetches git + GitHub data,
// computes Phase 1 metrics, and stores everything in the database.
func Run(database *sqlx.DB, opts Options) (*Result, error) {
	result := &Result{RepoPath: opts.RepoPath}

	// 1. Parse git repo metadata
	gitParser := parsers.NewGitParser(opts.RepoPath)

	repoRoot, err := gitParser.RepoRoot()
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}
	result.RepoPath = repoRoot

	remoteURL, err := gitParser.RemoteURL()
	if err != nil {
		return nil, fmt.Errorf("failed to get remote URL: %w", err)
	}

	owner, repo, err := parsers.ParseGitHubRemote(remoteURL)
	if err != nil {
		return nil, fmt.Errorf("could not parse GitHub remote: %w", err)
	}
	result.Owner = owner
	result.Repo = repo

	// 2. Upsert repo in database
	repoID, err := db.UpsertRepo(database, repoRoot, remoteURL, owner, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert repo: %w", err)
	}

	// 3. Fetch PRs from GitHub
	ghParser := parsers.NewGitHubParser(owner, repo)

	log.Printf("Fetching PRs for %s/%s...", owner, repo)
	prs, err := ghParser.ListPRs("all", 100)
	if err != nil {
		return nil, fmt.Errorf("failed to list PRs: %w", err)
	}

	defaultBranch, err := gitParser.DefaultBranch()
	if err != nil {
		defaultBranch = "main"
	}

	// 4. Process each PR
	// Collect file lists per PR for line revisit calculation
	prFiles := make(map[int][]string)

	for _, ghPR := range prs {
		log.Printf("Processing PR #%d: %s", ghPR.Number, ghPR.Title)

		// Map state from gh CLI format
		state := strings.ToLower(ghPR.State)

		pr := &db.PR{
			RepoID:       repoID,
			Number:       ghPR.Number,
			Title:        sql.NullString{String: ghPR.Title, Valid: true},
			Branch:       sql.NullString{String: ghPR.HeadRefName, Valid: ghPR.HeadRefName != ""},
			State:        sql.NullString{String: state, Valid: true},
			CreatedAt:    sql.NullString{String: ghPR.CreatedAt, Valid: ghPR.CreatedAt != ""},
			MergedAt:     sql.NullString{String: ghPR.MergedAt, Valid: ghPR.MergedAt != ""},
			ClosedAt:     sql.NullString{String: ghPR.ClosedAt, Valid: ghPR.ClosedAt != ""},
			URL:          sql.NullString{String: ghPR.URL, Valid: ghPR.URL != ""},
			Additions:    ghPR.Additions,
			Deletions:    ghPR.Deletions,
			ChangedFiles: ghPR.ChangedFiles,
		}

		prID, err := db.UpsertPR(database, pr)
		if err != nil {
			log.Printf("  Warning: failed to upsert PR #%d: %v", ghPR.Number, err)
			result.PRsFailed++
			continue
		}

		// Compute metrics for this PR
		prMetrics := &db.PRMetrics{PRID: prID}

		// -- Post-open commits --
		commits, err := ghParser.GetPRCommits(ghPR.Number)
		if err != nil {
			log.Printf("  Warning: failed to get commits for PR #%d: %v", ghPR.Number, err)
		} else {
			postOpen := metrics.PostOpenCommits(commits, ghPR.CreatedAt)
			prMetrics.PostOpenCommits = sql.NullInt64{Int64: int64(postOpen), Valid: true}

			// Collect files for line revisit
			for _, c := range commits {
				files, err := gitParser.FilesChangedInCommit(c.SHA)
				if err == nil {
					prFiles[ghPR.Number] = append(prFiles[ghPR.Number], files...)
				}
			}
		}

		// -- First-pass acceptance --
		reviews, err := ghParser.GetPRReviews(ghPR.Number)
		if err != nil {
			log.Printf("  Warning: failed to get reviews for PR #%d: %v", ghPR.Number, err)
		} else {
			accepted := metrics.FirstPassAccepted(reviews)
			val := int64(0)
			if accepted {
				val = 1
			}
			prMetrics.FirstPassAccepted = sql.NullInt64{Int64: val, Valid: true}
		}

		// -- CI success rate --
		checks, err := ghParser.GetPRChecks(ghPR.Number)
		if err != nil {
			log.Printf("  Warning: failed to get checks for PR #%d: %v", ghPR.Number, err)
		} else {
			rate := metrics.CISuccessRate(checks)
			if rate >= 0 {
				prMetrics.CISuccessRate = sql.NullFloat64{Float64: rate, Valid: true}
			}
		}

		// -- Test coverage --
		if files, ok := prFiles[ghPR.Number]; ok {
			hasTests := metrics.HasTestFiles(files)
			val := int64(0)
			if hasTests {
				val = 1
			}
			prMetrics.HasTests = sql.NullInt64{Int64: val, Valid: true}
		}

		// -- Diff churn --
		if ghPR.HeadRefName != "" && state == "merged" {
			branchCommits, err := gitParser.CommitsOnBranch(ghPR.HeadRefName, defaultBranch)
			if err == nil && len(branchCommits) > 0 {
				totalAdded := 0
				for _, c := range branchCommits {
					totalAdded += c.Additions
				}

				netStats, err := gitParser.DiffStatBetween(defaultBranch, ghPR.HeadRefName)
				if err == nil {
					netAdded := 0
					for _, s := range netStats {
						netAdded += s.Additions
					}
					churn := metrics.DiffChurn(totalAdded, netAdded)
					prMetrics.DiffChurnLines = sql.NullInt64{Int64: int64(churn), Valid: true}
				}
			}
		}

		// Store commits in database
		if commits != nil {
			for _, c := range commits {
				authorName := ""
				if len(c.Authors) > 0 {
					authorName = c.Authors[0].Name
				}
				isClaude := strings.Contains(c.MessageBody, "Co-Authored-By") &&
					strings.Contains(strings.ToLower(c.MessageBody), "claude")
				isPostOpen := c.CommittedDate > ghPR.CreatedAt

				commit := &db.Commit{
					SHA:              c.SHA,
					RepoID:           repoID,
					PRID:             sql.NullInt64{Int64: prID, Valid: true},
					Message:          sql.NullString{String: c.MessageHeadline, Valid: true},
					Author:           sql.NullString{String: authorName, Valid: authorName != ""},
					CommittedAt:      sql.NullString{String: c.CommittedDate, Valid: c.CommittedDate != ""},
					IsClaudeAuthored: boolToInt(isClaude),
					IsPostOpen:       boolToInt(isPostOpen),
				}
				if err := db.UpsertCommit(database, commit); err != nil {
					log.Printf("  Warning: failed to store commit %s: %v", c.SHA[:8], err)
				}
			}
		}

		// Store metrics
		if err := db.UpsertPRMetrics(database, prMetrics); err != nil {
			log.Printf("  Warning: failed to store metrics for PR #%d: %v", ghPR.Number, err)
		}

		result.PRsSynced++
	}

	// 5. Calculate line revisit rates across all PRs
	revisits := metrics.CalculateLineRevisits(prFiles)
	if len(revisits) > 0 {
		log.Printf("Found %d files modified across multiple PRs", len(revisits))
		// Store revisit data as a metric on each PR that has revisited files
		// For now, we calculate an average revisit rate per PR
		for prNum, files := range prFiles {
			revisitCount := 0
			for _, f := range files {
				for _, r := range revisits {
					if r.File == f {
						revisitCount += r.RevisitCount
						break
					}
				}
			}
			if revisitCount > 0 && len(files) > 0 {
				rate := float64(revisitCount) / float64(len(files))
				// Update the PR metrics with the revisit rate
				var prID int64
				err := database.Get(&prID, "SELECT id FROM prs WHERE repo_id = ? AND number = ?", repoID, prNum)
				if err == nil {
					database.Exec(
						"UPDATE pr_metrics SET line_revisit_rate = ? WHERE pr_id = ?",
						rate, prID,
					)
				}
			}
		}
	}

	// 6. Update sync timestamp
	if err := db.UpdateRepoSyncTime(database, repoID); err != nil {
		log.Printf("Warning: failed to update sync time: %v", err)
	}

	return result, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
