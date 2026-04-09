package events

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"github.com/austinroos/ax/internal/db"
	axsync "github.com/austinroos/ax/internal/sync"
	"github.com/jmoiron/sqlx"
)

// --- PROpenedHandler ---

// PROpenedHandler handles pr_opened events by creating a PR record.
type PROpenedHandler struct {
	DB *sqlx.DB
}

func (h *PROpenedHandler) AcceptsType(t EventType) bool {
	return t == EventPROpened
}

func (h *PROpenedHandler) HandleEvent(evt Event) error {
	repo, err := db.GetRepoByOwnerAndName(h.DB, evt.RepoOwner, evt.RepoName)
	if err != nil || repo == nil {
		log.Printf("  PR #%d opened but repo %s/%s not found, skipping", evt.PRNumber, evt.RepoOwner, evt.RepoName)
		return nil
	}

	pr := &db.PR{
		RepoID:          repo.ID,
		Number:          evt.PRNumber,
		Title:           sql.NullString{String: evt.PRTitle, Valid: evt.PRTitle != ""},
		Branch:          sql.NullString{String: evt.PRBranch, Valid: evt.PRBranch != ""},
		State:           sql.NullString{String: "open", Valid: true},
		CreatedAt:       sql.NullString{String: evt.PRCreatedAt, Valid: evt.PRCreatedAt != ""},
		URL:             sql.NullString{String: evt.PRURL, Valid: evt.PRURL != ""},
		Author:          sql.NullString{String: evt.PRAuthor, Valid: evt.PRAuthor != ""},
		OpenCommitCount: sql.NullInt64{Int64: int64(evt.PRCommitCount), Valid: true},
	}
	prID, err := db.UpsertPR(h.DB, pr)
	if err != nil {
		return fmt.Errorf("failed to upsert PR #%d: %w", evt.PRNumber, err)
	}

	// Initialize post_open_commits to 0
	m := &db.PRMetrics{
		PRID:            prID,
		PostOpenCommits: sql.NullInt64{Int64: 0, Valid: true},
	}
	if err := db.UpsertPRMetrics(h.DB, m); err != nil {
		return fmt.Errorf("failed to initialize metrics for PR #%d: %w", evt.PRNumber, err)
	}

	log.Printf("  Created PR #%d via %s webhook", evt.PRNumber, evt.Platform)
	return nil
}

// --- SynchronizeHandler ---

// SynchronizeHandler handles pr_synchronized events by updating post_open_commits.
type SynchronizeHandler struct {
	DB *sqlx.DB
}

func (h *SynchronizeHandler) AcceptsType(t EventType) bool {
	return t == EventPRSynchronized
}

func (h *SynchronizeHandler) HandleEvent(evt Event) error {
	repo, err := db.GetRepoByOwnerAndName(h.DB, evt.RepoOwner, evt.RepoName)
	if err != nil || repo == nil {
		return nil
	}

	pr, err := db.GetPRByRepoAndNumber(h.DB, repo.ID, evt.PRNumber)
	if err != nil || pr == nil {
		return nil
	}

	finalized, _ := db.IsPRFinalized(h.DB, pr.ID)
	if finalized {
		return nil
	}

	if !pr.OpenCommitCount.Valid {
		return nil
	}

	postOpen := int64(evt.PRCommitCount) - pr.OpenCommitCount.Int64
	if postOpen < 0 {
		postOpen = 0
	}

	existing, _ := db.GetPRMetrics(h.DB, pr.ID)
	if existing == nil {
		existing = &db.PRMetrics{PRID: pr.ID}
	}
	existing.PostOpenCommits = sql.NullInt64{Int64: postOpen, Valid: true}

	if err := db.UpsertPRMetrics(h.DB, existing); err != nil {
		return fmt.Errorf("failed to update post_open_commits for PR #%d: %w", evt.PRNumber, err)
	}

	log.Printf("  Updated post_open_commits=%d for PR #%d", postOpen, evt.PRNumber)
	return nil
}

// --- ReviewHandler ---

// ReviewHandler handles review_submitted events by updating first_pass_accepted.
// Uses latch logic: once CHANGES_REQUESTED is seen, first_pass_accepted stays 0.
type ReviewHandler struct {
	DB *sqlx.DB
}

func (h *ReviewHandler) AcceptsType(t EventType) bool {
	return t == EventReviewSubmitted
}

func (h *ReviewHandler) HandleEvent(evt Event) error {
	repo, err := db.GetRepoByOwnerAndName(h.DB, evt.RepoOwner, evt.RepoName)
	if err != nil || repo == nil {
		return nil
	}

	pr, err := db.GetPRByRepoAndNumber(h.DB, repo.ID, evt.PRNumber)
	if err != nil || pr == nil {
		return nil
	}

	finalized, _ := db.IsPRFinalized(h.DB, pr.ID)
	if finalized {
		return nil
	}

	existing, _ := db.GetPRMetrics(h.DB, pr.ID)
	if existing == nil {
		existing = &db.PRMetrics{PRID: pr.ID}
	}

	state := strings.ToUpper(evt.ReviewState)
	switch state {
	case "CHANGES_REQUESTED":
		existing.FirstPassAccepted = sql.NullInt64{Int64: 0, Valid: true}
	case "APPROVED":
		if !existing.FirstPassAccepted.Valid {
			existing.FirstPassAccepted = sql.NullInt64{Int64: 1, Valid: true}
		}
	default:
		// COMMENTED, DISMISSED, etc. — no change to first_pass_accepted
		return nil
	}

	if err := db.UpsertPRMetrics(h.DB, existing); err != nil {
		return fmt.Errorf("failed to update first_pass_accepted for PR #%d: %w", evt.PRNumber, err)
	}

	log.Printf("  Updated first_pass_accepted=%d for PR #%d (review: %s)", existing.FirstPassAccepted.Int64, evt.PRNumber, state)
	return nil
}

// --- CIHandler ---

// CIHandler handles ci_completed events by updating ci_success_rate.
// Suite-level: latest check_suite conclusion overwrites the metric.
type CIHandler struct {
	DB *sqlx.DB
}

func (h *CIHandler) AcceptsType(t EventType) bool {
	return t == EventCICompleted
}

func (h *CIHandler) HandleEvent(evt Event) error {
	repo, err := db.GetRepoByOwnerAndName(h.DB, evt.RepoOwner, evt.RepoName)
	if err != nil || repo == nil {
		return nil
	}

	pr, err := db.GetPRByRepoAndNumber(h.DB, repo.ID, evt.PRNumber)
	if err != nil || pr == nil {
		return nil
	}

	finalized, _ := db.IsPRFinalized(h.DB, pr.ID)
	if finalized {
		return nil
	}

	existing, _ := db.GetPRMetrics(h.DB, pr.ID)
	if existing == nil {
		existing = &db.PRMetrics{PRID: pr.ID}
	}

	rate := 0.0
	if strings.ToLower(evt.CheckConclusion) == "success" {
		rate = 1.0
	}
	existing.CISuccessRate = sql.NullFloat64{Float64: rate, Valid: true}

	if err := db.UpsertPRMetrics(h.DB, existing); err != nil {
		return fmt.Errorf("failed to update ci_success_rate for PR #%d: %w", evt.PRNumber, err)
	}

	log.Printf("  Updated ci_success_rate=%.1f for PR #%d (conclusion: %s)", rate, evt.PRNumber, evt.CheckConclusion)
	return nil
}

// --- PRHandler ---

// PRHandler handles pr_merged and pr_closed events by finalizing metrics.
// All metric values should already be populated by incremental handlers
// (ReviewHandler, CIHandler, SynchronizeHandler). This handler loads
// existing metrics and marks them as finalized.
type PRHandler struct {
	DB *sqlx.DB
}

func (h *PRHandler) AcceptsType(t EventType) bool {
	return t == EventPRMerged || t == EventPRClosed
}

func (h *PRHandler) HandleEvent(evt Event) error {
	repo, err := db.GetRepoByOwnerAndName(h.DB, evt.RepoOwner, evt.RepoName)
	if err != nil || repo == nil {
		return fmt.Errorf("repo %s/%s not found (must be synced first)", evt.RepoOwner, evt.RepoName)
	}

	// Upsert PR with terminal state
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
		Author:   sql.NullString{String: evt.PRAuthor, Valid: evt.PRAuthor != ""},
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

	// Load existing metrics (populated by incremental handlers)
	existing, _ := db.GetPRMetrics(h.DB, prID)
	if existing == nil {
		existing = &db.PRMetrics{PRID: prID}
	}

	// Backup: compute post_open_commits from closed event if not already set
	if !existing.PostOpenCommits.Valid && evt.PRCommitCount > 0 {
		// Re-read PR to get open_commit_count (may have been set by PROpenedHandler)
		savedPR, _ := db.GetPRByRepoAndNumber(h.DB, repo.ID, evt.PRNumber)
		if savedPR != nil && savedPR.OpenCommitCount.Valid {
			postOpen := int64(evt.PRCommitCount) - savedPR.OpenCommitCount.Int64
			if postOpen < 0 {
				postOpen = 0
			}
			existing.PostOpenCommits = sql.NullInt64{Int64: postOpen, Valid: true}
		}
	}

	// Finalize
	if err := axsync.FinalizePR(h.DB, prID, existing); err != nil {
		return fmt.Errorf("failed to finalize PR #%d: %w", evt.PRNumber, err)
	}

	log.Printf("  Finalized PR #%d via %s webhook", evt.PRNumber, evt.Platform)
	return nil
}
