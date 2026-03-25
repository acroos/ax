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

// WatchResult contains a summary of what changed during a watch poll cycle.
type WatchResult struct {
	ReposPolled    int
	PRsChecked     int
	PRsFinalized   int
	PRsTransitioned int
}

// RunGitHubOnly performs a lightweight sync that only checks GitHub PR state changes.
// It detects state transitions (open → merged/closed) and finalizes metrics for
// PRs that have reached terminal states. It does NOT parse sessions or re-correlate.
func RunGitHubOnly(database *sqlx.DB) (*WatchResult, error) {
	result := &WatchResult{}

	// Get all enabled watched repos
	watchedRepos, err := db.GetEnabledWatchedRepos(database)
	if err != nil {
		return nil, fmt.Errorf("failed to get watched repos: %w", err)
	}

	if len(watchedRepos) == 0 {
		return result, nil
	}

	for _, wr := range watchedRepos {
		repo, err := getRepoByID(database, wr.RepoID)
		if err != nil || repo == nil {
			log.Printf("Warning: watched repo ID %d not found, skipping", wr.RepoID)
			continue
		}

		if !repo.GithubOwner.Valid || !repo.GithubRepo.Valid {
			continue
		}

		pollResult, err := pollRepo(database, repo)
		if err != nil {
			log.Printf("Warning: failed to poll %s/%s: %v", repo.GithubOwner.String, repo.GithubRepo.String, err)
			continue
		}

		result.ReposPolled++
		result.PRsChecked += pollResult.PRsChecked
		result.PRsFinalized += pollResult.PRsFinalized
		result.PRsTransitioned += pollResult.PRsTransitioned

		db.UpdateWatchedRepoPolledAt(database, wr.RepoID)
	}

	return result, nil
}

// RunGitHubOnlyForRepo performs a watch poll for a single repo by path.
// If the repo isn't in the watched_repos table, it still polls but doesn't
// update last_polled_at.
func RunGitHubOnlyForRepo(database *sqlx.DB, repoPath string) (*WatchResult, error) {
	result := &WatchResult{}

	gitParser := parsers.NewGitParser(repoPath)
	repoRoot, err := gitParser.RepoRoot()
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}

	repo, err := db.GetRepoByPath(database, repoRoot)
	if err != nil || repo == nil {
		return nil, fmt.Errorf("repo not yet synced — run 'ax sync --repo %s' first", repoRoot)
	}

	if !repo.GithubOwner.Valid || !repo.GithubRepo.Valid {
		return nil, fmt.Errorf("repo has no GitHub remote configured")
	}

	pollResult, err := pollRepo(database, repo)
	if err != nil {
		return nil, err
	}

	result.ReposPolled = 1
	result.PRsChecked = pollResult.PRsChecked
	result.PRsFinalized = pollResult.PRsFinalized
	result.PRsTransitioned = pollResult.PRsTransitioned

	// Update polled_at if this repo is being watched
	db.UpdateWatchedRepoPolledAt(database, repo.ID)

	return result, nil
}

type pollResult struct {
	PRsChecked      int
	PRsFinalized    int
	PRsTransitioned int
}

func pollRepo(database *sqlx.DB, repo *db.Repo) (*pollResult, error) {
	result := &pollResult{}
	owner := repo.GithubOwner.String
	repoName := repo.GithubRepo.String

	log.Printf("Polling %s/%s for PR state changes...", owner, repoName)

	ghParser := parsers.NewGitHubParser(owner, repoName)
	prs, err := ghParser.ListPRs("all", 100)
	if err != nil {
		return nil, fmt.Errorf("failed to list PRs: %w", err)
	}

	for _, ghPR := range prs {
		result.PRsChecked++
		state := strings.ToLower(ghPR.State)

		// Upsert the PR (this also sets previous_state via the ON CONFLICT clause)
		pr := &db.PR{
			RepoID:       repo.ID,
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
			continue
		}

		// Check if this PR just transitioned to a terminal state
		if !IsTerminalState(state) {
			continue
		}

		// Check if already finalized
		finalized, _ := db.IsPRFinalized(database, prID)
		if finalized {
			continue
		}

		// This PR needs finalization — it's in a terminal state but not yet finalized
		log.Printf("  PR #%d transitioned to %s — finalizing metrics", ghPR.Number, state)
		result.PRsTransitioned++

		// Load existing metrics (may have session data from prior syncs)
		existing, _ := db.GetPRMetrics(database, prID)
		if existing == nil {
			existing = &db.PRMetrics{PRID: prID}
		}

		// Compute Phase 1 metrics from GitHub data
		// -- First-pass acceptance --
		reviews, err := ghParser.GetPRReviews(ghPR.Number)
		if err == nil {
			accepted := metrics.FirstPassAccepted(reviews)
			val := int64(0)
			if accepted {
				val = 1
			}
			existing.FirstPassAccepted = sql.NullInt64{Int64: val, Valid: true}
		}

		// -- CI success rate --
		checks, err := ghParser.GetPRChecks(ghPR.Number)
		if err == nil {
			rate := metrics.CISuccessRate(checks)
			if rate >= 0 {
				existing.CISuccessRate = sql.NullFloat64{Float64: rate, Valid: true}
			}
		}

		// -- Post-open commits --
		commits, err := ghParser.GetPRCommits(ghPR.Number)
		if err == nil {
			postOpen := metrics.PostOpenCommits(commits, ghPR.CreatedAt)
			existing.PostOpenCommits = sql.NullInt64{Int64: int64(postOpen), Valid: true}
		}

		if err := FinalizePR(database, prID, existing); err != nil {
			log.Printf("  Warning: failed to finalize PR #%d: %v", ghPR.Number, err)
		} else {
			result.PRsFinalized++
			log.Printf("  Finalized PR #%d", ghPR.Number)
		}
	}

	// Recompute unmerged token spend
	sessionsByID := loadSessionsForRepo(database, repo.ID)
	if len(sessionsByID) > 0 {
		computeUnmergedTokenSpend(database, repo.ID, sessionsByID)
	}

	return result, nil
}

func getRepoByID(database *sqlx.DB, id int64) (*db.Repo, error) {
	var repo db.Repo
	err := database.Get(&repo, "SELECT * FROM repos WHERE id = ?", id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &repo, nil
}

// loadSessionsForRepo builds a sessionsByID map from the database for unmerged token spend.
func loadSessionsForRepo(database *sqlx.DB, repoID int64) map[string]*parsers.ParsedSession {
	var sessions []db.Session
	err := database.Select(&sessions, "SELECT * FROM sessions WHERE repo_id = ?", repoID)
	if err != nil || len(sessions) == 0 {
		return nil
	}

	result := make(map[string]*parsers.ParsedSession)
	for _, s := range sessions {
		result[s.ID] = &parsers.ParsedSession{
			ID:                       s.ID,
			HumanMessages:            s.MessageCount,
			TurnCount:                s.TurnCount,
			InputTokens:              s.InputTokens,
			OutputTokens:             s.OutputTokens,
			CacheCreationInputTokens: s.CacheCreationInputTokens,
			CacheReadInputTokens:     s.CacheReadInputTokens,
			TotalCostUSD:             s.TotalCostUSD.Float64,
		}
	}
	return result
}
