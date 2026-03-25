package events

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/austinroos/ax/internal/db"
	"github.com/austinroos/ax/internal/metrics"
	"github.com/austinroos/ax/internal/parsers"
	axsync "github.com/austinroos/ax/internal/sync"
	"github.com/jmoiron/sqlx"
)

// PRHandler handles pr_merged and pr_closed events by finalizing metrics.
type PRHandler struct {
	DB *sqlx.DB
}

func (h *PRHandler) AcceptsType(t EventType) bool {
	return t == EventPRMerged || t == EventPRClosed
}

func (h *PRHandler) HandleEvent(evt Event) error {
	// Look up repo
	repo, err := db.GetRepoByOwnerAndName(h.DB, evt.RepoOwner, evt.RepoName)
	if err != nil || repo == nil {
		return fmt.Errorf("repo %s/%s not found (must be synced first)", evt.RepoOwner, evt.RepoName)
	}

	// Upsert PR with new state
	state := "closed"
	if evt.Type == EventPRMerged {
		state = "merged"
	}
	pr := &db.PR{
		RepoID:   repo.ID,
		Number:   evt.PRNumber,
		Title:    sql.NullString{String: evt.PRTitle, Valid: evt.PRTitle != ""},
		Branch:   sql.NullString{String: evt.PRBranch, Valid: evt.PRBranch != ""},
		State:    sql.NullString{String: state, Valid: true},
		MergedAt: sql.NullString{String: evt.MergedAt, Valid: evt.MergedAt != ""},
		ClosedAt: sql.NullString{String: evt.ClosedAt, Valid: evt.ClosedAt != ""},
		URL:      sql.NullString{String: evt.PRURL, Valid: evt.PRURL != ""},
	}
	prID, err := db.UpsertPR(h.DB, pr)
	if err != nil {
		return fmt.Errorf("failed to upsert PR #%d: %w", evt.PRNumber, err)
	}

	// Check if already finalized
	finalized, _ := db.IsPRFinalized(h.DB, prID)
	if finalized {
		log.Printf("  PR #%d already finalized, skipping", evt.PRNumber)
		return nil
	}

	// Load existing metrics
	existing, _ := db.GetPRMetrics(h.DB, prID)
	if existing == nil {
		existing = &db.PRMetrics{PRID: prID}
	}

	// Fetch additional data from GitHub for metric computation
	ghParser := parsers.NewGitHubParser(evt.RepoOwner, evt.RepoName)

	// First-pass acceptance
	reviews, err := ghParser.GetPRReviews(evt.PRNumber)
	if err == nil {
		accepted := metrics.FirstPassAccepted(reviews)
		val := int64(0)
		if accepted {
			val = 1
		}
		existing.FirstPassAccepted = sql.NullInt64{Int64: val, Valid: true}
	}

	// CI success rate
	checks, err := ghParser.GetPRChecks(evt.PRNumber)
	if err == nil {
		rate := metrics.CISuccessRate(checks)
		if rate >= 0 {
			existing.CISuccessRate = sql.NullFloat64{Float64: rate, Valid: true}
		}
	}

	// Post-open commits
	commits, err := ghParser.GetPRCommits(evt.PRNumber)
	if err == nil {
		postOpen := metrics.PostOpenCommits(commits, pr.CreatedAt.String)
		existing.PostOpenCommits = sql.NullInt64{Int64: int64(postOpen), Valid: true}
	}

	// Finalize
	if err := axsync.FinalizePR(h.DB, prID, existing); err != nil {
		return fmt.Errorf("failed to finalize PR #%d: %w", evt.PRNumber, err)
	}

	log.Printf("  Finalized PR #%d via %s webhook", evt.PRNumber, evt.Platform)
	return nil
}
