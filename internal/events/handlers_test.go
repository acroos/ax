package events

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/db"
)

// setupTestDB creates a temporary SQLite database with a repo and returns the store, repo ID, and cleanup function.
func setupTestDB(t *testing.T) (*db.Store, int64) {
	t.Helper()
	dir := t.TempDir()
	store, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	t.Cleanup(func() { store.Close() })

	repoID, err := db.UpsertRepo(store.DB, "/tmp/test-repo", "https://github.com/test/repo.git", "test", "repo")
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}
	return store, repoID
}

// createPR creates a PR in the database and returns its ID.
func createPR(t *testing.T, store *db.Store, repoID int64, number int, openCommitCount int64) int64 {
	t.Helper()
	pr := &db.PR{
		RepoID:          repoID,
		Number:          number,
		Title:           sql.NullString{String: "Test PR", Valid: true},
		Branch:          sql.NullString{String: "feature-branch", Valid: true},
		State:           sql.NullString{String: "open", Valid: true},
		OpenCommitCount: sql.NullInt64{Int64: openCommitCount, Valid: true},
	}
	prID, err := db.UpsertPR(store.DB, pr)
	if err != nil {
		t.Fatalf("failed to create PR: %v", err)
	}
	return prID
}

// --- PROpenedHandler Tests ---

func TestPROpenedHandler_CreatesPR(t *testing.T) {
	store, _ := setupTestDB(t)
	handler := &PROpenedHandler{DB: store.DB}

	evt := Event{
		Type:          EventPROpened,
		RepoOwner:     "test",
		RepoName:      "repo",
		PRNumber:      1,
		PRTitle:       "Add feature",
		PRBranch:      "feature-branch",
		PRURL:         "https://github.com/test/repo/pull/1",
		PRCreatedAt:   "2026-04-01T12:00:00Z",
		PRAuthor:      "developer",
		PRCommitCount: 3,
		Platform:      PlatformGitHub,
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	// Verify PR was created
	repo, _ := db.GetRepoByOwnerAndName(store.DB, "test", "repo")
	pr, err := db.GetPRByRepoAndNumber(store.DB, repo.ID, 1)
	if err != nil {
		t.Fatalf("failed to get PR: %v", err)
	}
	if pr == nil {
		t.Fatal("expected PR to exist")
	}
	if pr.Title.String != "Add feature" {
		t.Errorf("expected title 'Add feature', got %q", pr.Title.String)
	}
	if pr.Author.String != "developer" {
		t.Errorf("expected author 'developer', got %q", pr.Author.String)
	}
	if !pr.OpenCommitCount.Valid || pr.OpenCommitCount.Int64 != 3 {
		t.Errorf("expected open_commit_count=3, got %v", pr.OpenCommitCount)
	}

	// Verify metrics initialized with post_open_commits=0
	m, err := db.GetPRMetrics(store.DB, pr.ID)
	if err != nil {
		t.Fatalf("failed to get metrics: %v", err)
	}
	if m == nil {
		t.Fatal("expected metrics to exist")
	}
	if !m.PostOpenCommits.Valid || m.PostOpenCommits.Int64 != 0 {
		t.Errorf("expected post_open_commits=0, got %v", m.PostOpenCommits)
	}
}

func TestPROpenedHandler_SkipsUnknownRepo(t *testing.T) {
	store, _ := setupTestDB(t)
	handler := &PROpenedHandler{DB: store.DB}

	evt := Event{
		Type:      EventPROpened,
		RepoOwner: "unknown",
		RepoName:  "repo",
		PRNumber:  1,
	}

	// Should not error, just skip
	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("expected no error for unknown repo, got: %v", err)
	}
}

// --- SynchronizeHandler Tests ---

func TestSynchronizeHandler_UpdatesPostOpenCommits(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 2) // opened with 2 commits

	// Initialize metrics
	db.UpsertPRMetrics(store.DB, &db.PRMetrics{PRID: prID, PostOpenCommits: sql.NullInt64{Int64: 0, Valid: true}})

	handler := &SynchronizeHandler{DB: store.DB}
	evt := Event{
		Type:          EventPRSynchronized,
		RepoOwner:     "test",
		RepoName:      "repo",
		PRNumber:      1,
		PRCommitCount: 5, // now has 5 total commits
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	m, _ := db.GetPRMetrics(store.DB, prID)
	if m == nil {
		t.Fatal("expected metrics to exist")
	}
	// 5 total - 2 initial = 3 post-open
	if !m.PostOpenCommits.Valid || m.PostOpenCommits.Int64 != 3 {
		t.Errorf("expected post_open_commits=3, got %v", m.PostOpenCommits)
	}
}

func TestSynchronizeHandler_SkipsFinalizedPR(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 2)

	// Finalize the PR
	m := &db.PRMetrics{PRID: prID, MetricsFinalized: 1}
	db.UpsertPRMetrics(store.DB, m)

	handler := &SynchronizeHandler{DB: store.DB}
	evt := Event{
		Type:          EventPRSynchronized,
		RepoOwner:     "test",
		RepoName:      "repo",
		PRNumber:      1,
		PRCommitCount: 10,
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	// Metrics should remain unchanged
	got, _ := db.GetPRMetrics(store.DB, prID)
	if got.PostOpenCommits.Valid {
		t.Error("expected post_open_commits to remain unset for finalized PR")
	}
}

func TestSynchronizeHandler_SkipsUnknownPR(t *testing.T) {
	store, _ := setupTestDB(t)
	handler := &SynchronizeHandler{DB: store.DB}

	evt := Event{
		Type:          EventPRSynchronized,
		RepoOwner:     "test",
		RepoName:      "repo",
		PRNumber:      999,
		PRCommitCount: 5,
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("expected no error for unknown PR, got: %v", err)
	}
}

// --- ReviewHandler Tests ---

func TestReviewHandler_ApprovedSetsOne(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	handler := &ReviewHandler{DB: store.DB}
	evt := Event{
		Type:        EventReviewSubmitted,
		RepoOwner:   "test",
		RepoName:    "repo",
		PRNumber:    1,
		ReviewState: "APPROVED",
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	m, _ := db.GetPRMetrics(store.DB, prID)
	if m == nil {
		t.Fatal("expected metrics to exist")
	}
	if !m.FirstPassAccepted.Valid || m.FirstPassAccepted.Int64 != 1 {
		t.Errorf("expected first_pass_accepted=1, got %v", m.FirstPassAccepted)
	}
}

func TestReviewHandler_ChangesRequestedSetsZero(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	handler := &ReviewHandler{DB: store.DB}
	evt := Event{
		Type:        EventReviewSubmitted,
		RepoOwner:   "test",
		RepoName:    "repo",
		PRNumber:    1,
		ReviewState: "CHANGES_REQUESTED",
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	m, _ := db.GetPRMetrics(store.DB, prID)
	if m == nil {
		t.Fatal("expected metrics to exist")
	}
	if !m.FirstPassAccepted.Valid || m.FirstPassAccepted.Int64 != 0 {
		t.Errorf("expected first_pass_accepted=0, got %v", m.FirstPassAccepted)
	}
}

func TestReviewHandler_ApprovedDoesNotOverrideChangesRequested(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	handler := &ReviewHandler{DB: store.DB}

	// First: changes requested
	handler.HandleEvent(Event{
		Type: EventReviewSubmitted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, ReviewState: "CHANGES_REQUESTED",
	})

	// Then: approved (should NOT override)
	handler.HandleEvent(Event{
		Type: EventReviewSubmitted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, ReviewState: "APPROVED",
	})

	m, _ := db.GetPRMetrics(store.DB, prID)
	if !m.FirstPassAccepted.Valid || m.FirstPassAccepted.Int64 != 0 {
		t.Errorf("expected first_pass_accepted to remain 0 after latch, got %v", m.FirstPassAccepted)
	}
}

func TestReviewHandler_ChangesRequestedOverridesApproved(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	handler := &ReviewHandler{DB: store.DB}

	// First: approved
	handler.HandleEvent(Event{
		Type: EventReviewSubmitted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, ReviewState: "APPROVED",
	})

	// Then: changes requested (should override)
	handler.HandleEvent(Event{
		Type: EventReviewSubmitted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, ReviewState: "CHANGES_REQUESTED",
	})

	m, _ := db.GetPRMetrics(store.DB, prID)
	if !m.FirstPassAccepted.Valid || m.FirstPassAccepted.Int64 != 0 {
		t.Errorf("expected first_pass_accepted=0 after CHANGES_REQUESTED, got %v", m.FirstPassAccepted)
	}
}

func TestReviewHandler_SkipsFinalizedPR(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	// Finalize with first_pass_accepted=1
	db.UpsertPRMetrics(store.DB, &db.PRMetrics{
		PRID:             prID,
		FirstPassAccepted: sql.NullInt64{Int64: 1, Valid: true},
		MetricsFinalized: 1,
	})

	handler := &ReviewHandler{DB: store.DB}
	evt := Event{
		Type: EventReviewSubmitted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, ReviewState: "CHANGES_REQUESTED",
	}

	handler.HandleEvent(evt)

	m, _ := db.GetPRMetrics(store.DB, prID)
	if m.FirstPassAccepted.Int64 != 1 {
		t.Errorf("expected first_pass_accepted to remain 1 for finalized PR, got %v", m.FirstPassAccepted)
	}
}

func TestReviewHandler_CommentedNoChange(t *testing.T) {
	store, repoID := setupTestDB(t)
	createPR(t, store, repoID, 1, 1)

	handler := &ReviewHandler{DB: store.DB}
	evt := Event{
		Type: EventReviewSubmitted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, ReviewState: "COMMENTED",
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	// No metrics should be created for a COMMENTED review
	repo, _ := db.GetRepoByOwnerAndName(store.DB, "test", "repo")
	pr, _ := db.GetPRByRepoAndNumber(store.DB, repo.ID, 1)
	m, _ := db.GetPRMetrics(store.DB, pr.ID)
	if m != nil && m.FirstPassAccepted.Valid {
		t.Error("expected no first_pass_accepted for COMMENTED review")
	}
}

// --- CIHandler Tests ---

func TestCIHandler_SuccessSetsOne(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	handler := &CIHandler{DB: store.DB}
	evt := Event{
		Type: EventCICompleted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, CheckConclusion: "success",
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	m, _ := db.GetPRMetrics(store.DB, prID)
	if m == nil {
		t.Fatal("expected metrics to exist")
	}
	if !m.CISuccessRate.Valid || m.CISuccessRate.Float64 != 1.0 {
		t.Errorf("expected ci_success_rate=1.0, got %v", m.CISuccessRate)
	}
}

func TestCIHandler_FailureSetsZero(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	handler := &CIHandler{DB: store.DB}
	evt := Event{
		Type: EventCICompleted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, CheckConclusion: "failure",
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	m, _ := db.GetPRMetrics(store.DB, prID)
	if !m.CISuccessRate.Valid || m.CISuccessRate.Float64 != 0.0 {
		t.Errorf("expected ci_success_rate=0.0, got %v", m.CISuccessRate)
	}
}

func TestCIHandler_LatestResultOverwrites(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	handler := &CIHandler{DB: store.DB}

	// First: failure
	handler.HandleEvent(Event{
		Type: EventCICompleted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, CheckConclusion: "failure",
	})

	// Then: success (should overwrite)
	handler.HandleEvent(Event{
		Type: EventCICompleted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, CheckConclusion: "success",
	})

	m, _ := db.GetPRMetrics(store.DB, prID)
	if !m.CISuccessRate.Valid || m.CISuccessRate.Float64 != 1.0 {
		t.Errorf("expected ci_success_rate=1.0 after overwrite, got %v", m.CISuccessRate)
	}
}

func TestCIHandler_SkipsFinalizedPR(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	db.UpsertPRMetrics(store.DB, &db.PRMetrics{
		PRID:             prID,
		CISuccessRate:    sql.NullFloat64{Float64: 1.0, Valid: true},
		MetricsFinalized: 1,
	})

	handler := &CIHandler{DB: store.DB}
	handler.HandleEvent(Event{
		Type: EventCICompleted, RepoOwner: "test", RepoName: "repo",
		PRNumber: 1, CheckConclusion: "failure",
	})

	m, _ := db.GetPRMetrics(store.DB, prID)
	if m.CISuccessRate.Float64 != 1.0 {
		t.Errorf("expected ci_success_rate to remain 1.0 for finalized PR, got %v", m.CISuccessRate)
	}
}

// --- PRHandler Tests ---

func TestPRHandler_FinalizesWithExistingMetrics(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 2)

	// Pre-populate metrics from incremental handlers
	db.UpsertPRMetrics(store.DB, &db.PRMetrics{
		PRID:              prID,
		FirstPassAccepted: sql.NullInt64{Int64: 1, Valid: true},
		CISuccessRate:     sql.NullFloat64{Float64: 1.0, Valid: true},
		PostOpenCommits:   sql.NullInt64{Int64: 3, Valid: true},
	})

	handler := &PRHandler{DB: store.DB}
	evt := Event{
		Type:          EventPRMerged,
		RepoOwner:     "test",
		RepoName:      "repo",
		PRNumber:      1,
		PRTitle:       "Test PR",
		PRBranch:      "feature-branch",
		PRState:       "merged",
		MergedAt:      "2026-04-08T12:00:00Z",
		PRCommitCount: 5,
		Platform:      PlatformGitHub,
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	m, _ := db.GetPRMetrics(store.DB, prID)
	if m.MetricsFinalized != 1 {
		t.Error("expected metrics_finalized=1")
	}
	if !m.FirstPassAccepted.Valid || m.FirstPassAccepted.Int64 != 1 {
		t.Errorf("expected first_pass_accepted=1 preserved, got %v", m.FirstPassAccepted)
	}
	if !m.CISuccessRate.Valid || m.CISuccessRate.Float64 != 1.0 {
		t.Errorf("expected ci_success_rate=1.0 preserved, got %v", m.CISuccessRate)
	}
	if !m.PostOpenCommits.Valid || m.PostOpenCommits.Int64 != 3 {
		t.Errorf("expected post_open_commits=3 preserved, got %v", m.PostOpenCommits)
	}
}

func TestPRHandler_BackupPostOpenCommits(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 2) // opened with 2 commits

	// No synchronize events — metrics have no post_open_commits
	db.UpsertPRMetrics(store.DB, &db.PRMetrics{PRID: prID})

	handler := &PRHandler{DB: store.DB}
	evt := Event{
		Type:          EventPRMerged,
		RepoOwner:     "test",
		RepoName:      "repo",
		PRNumber:      1,
		PRCommitCount: 7, // 7 total at close time
		MergedAt:      "2026-04-08T12:00:00Z",
		Platform:      PlatformGitHub,
	}

	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	m, _ := db.GetPRMetrics(store.DB, prID)
	// 7 total - 2 initial = 5 post-open
	if !m.PostOpenCommits.Valid || m.PostOpenCommits.Int64 != 5 {
		t.Errorf("expected backup post_open_commits=5, got %v", m.PostOpenCommits)
	}
}

func TestPRHandler_SkipsAlreadyFinalized(t *testing.T) {
	store, repoID := setupTestDB(t)
	prID := createPR(t, store, repoID, 1, 1)

	db.UpsertPRMetrics(store.DB, &db.PRMetrics{
		PRID:             prID,
		MetricsFinalized: 1,
	})

	handler := &PRHandler{DB: store.DB}
	evt := Event{
		Type:      EventPRMerged,
		RepoOwner: "test",
		RepoName:  "repo",
		PRNumber:  1,
		MergedAt:  "2026-04-08T12:00:00Z",
	}

	// Should not error
	if err := handler.HandleEvent(evt); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}
}
