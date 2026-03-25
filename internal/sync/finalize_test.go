package sync

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/db"
)

func TestIsTerminalState(t *testing.T) {
	tests := []struct {
		state    string
		terminal bool
	}{
		{"merged", true},
		{"MERGED", true},
		{"Merged", true},
		{"closed", true},
		{"CLOSED", true},
		{"open", false},
		{"OPEN", false},
		{"draft", false},
		{"", false},
	}
	for _, tt := range tests {
		got := IsTerminalState(tt.state)
		if got != tt.terminal {
			t.Errorf("IsTerminalState(%q) = %v, want %v", tt.state, got, tt.terminal)
		}
	}
}

func setupTestDB(t *testing.T) *db.PR {
	t.Helper()
	return nil // placeholder, we return the actual setup below
}

func TestFinalizePR(t *testing.T) {
	dir := t.TempDir()
	store, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	// Create a repo and PR
	repoID, err := db.UpsertRepo(store.DB, "/tmp/test-repo", "", "test", "repo")
	if err != nil {
		t.Fatalf("failed to upsert repo: %v", err)
	}

	pr := &db.PR{
		RepoID: repoID,
		Number: 1,
		State:  sql.NullString{String: "merged", Valid: true},
	}
	prID, err := db.UpsertPR(store.DB, pr)
	if err != nil {
		t.Fatalf("failed to upsert PR: %v", err)
	}

	// Create metrics and finalize
	metrics := &db.PRMetrics{
		PRID:            prID,
		PostOpenCommits: sql.NullInt64{Int64: 3, Valid: true},
		CISuccessRate:   sql.NullFloat64{Float64: 0.95, Valid: true},
	}

	if err := FinalizePR(store.DB, prID, metrics); err != nil {
		t.Fatalf("failed to finalize PR: %v", err)
	}

	// Verify it's finalized
	finalized, err := db.IsPRFinalized(store.DB, prID)
	if err != nil {
		t.Fatalf("failed to check finalization: %v", err)
	}
	if !finalized {
		t.Error("expected PR to be finalized")
	}

	// Verify metrics are stored
	got, err := db.GetPRMetrics(store.DB, prID)
	if err != nil {
		t.Fatalf("failed to get metrics: %v", err)
	}
	if got.PostOpenCommits.Int64 != 3 {
		t.Errorf("expected post_open_commits 3, got %d", got.PostOpenCommits.Int64)
	}
	if got.MetricsFinalized != 1 {
		t.Errorf("expected metrics_finalized 1, got %d", got.MetricsFinalized)
	}
	if !got.FinalizedAt.Valid {
		t.Error("expected finalized_at to be set")
	}
}

func TestFinalizedPRsAreImmutable(t *testing.T) {
	dir := t.TempDir()
	store, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	repoID, _ := db.UpsertRepo(store.DB, "/tmp/test-repo", "", "test", "repo")

	pr := &db.PR{
		RepoID: repoID,
		Number: 1,
		State:  sql.NullString{String: "merged", Valid: true},
	}
	prID, _ := db.UpsertPR(store.DB, pr)

	// Finalize with specific values
	metrics := &db.PRMetrics{
		PRID:            prID,
		PostOpenCommits: sql.NullInt64{Int64: 5, Valid: true},
	}
	FinalizePR(store.DB, prID, metrics)

	// Try to upsert with different values — should be a no-op
	newMetrics := &db.PRMetrics{
		PRID:            prID,
		PostOpenCommits: sql.NullInt64{Int64: 99, Valid: true},
	}
	db.UpsertPRMetrics(store.DB, newMetrics)

	// Verify original values are preserved
	got, _ := db.GetPRMetrics(store.DB, prID)
	if got.PostOpenCommits.Int64 != 5 {
		t.Errorf("finalized metrics were overwritten: expected 5, got %d", got.PostOpenCommits.Int64)
	}
}

func TestMaybeFinalizePR_SkipsOpenPRs(t *testing.T) {
	dir := t.TempDir()
	store, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	repoID, _ := db.UpsertRepo(store.DB, "/tmp/test-repo", "", "test", "repo")
	pr := &db.PR{
		RepoID: repoID,
		Number: 1,
		State:  sql.NullString{String: "open", Valid: true},
	}
	prID, _ := db.UpsertPR(store.DB, pr)

	// Insert metrics (not finalized)
	db.UpsertPRMetrics(store.DB, &db.PRMetrics{PRID: prID})

	// Should not finalize
	finalized := MaybeFinalizePR(store.DB, prID, "open")
	if finalized {
		t.Error("expected MaybeFinalizePR to return false for open PR")
	}

	// Verify not finalized
	isFinalized, _ := db.IsPRFinalized(store.DB, prID)
	if isFinalized {
		t.Error("open PR should not be finalized")
	}
}

func TestGetFinalizedPRsForRepo(t *testing.T) {
	dir := t.TempDir()
	store, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	repoID, _ := db.UpsertRepo(store.DB, "/tmp/test-repo", "", "test", "repo")

	// Create 3 PRs: one finalized, one not finalized, one open with no metrics
	pr1 := &db.PR{RepoID: repoID, Number: 1, State: sql.NullString{String: "merged", Valid: true}}
	pr2 := &db.PR{RepoID: repoID, Number: 2, State: sql.NullString{String: "open", Valid: true}}
	pr3 := &db.PR{RepoID: repoID, Number: 3, State: sql.NullString{String: "closed", Valid: true}}

	prID1, _ := db.UpsertPR(store.DB, pr1)
	prID2, _ := db.UpsertPR(store.DB, pr2)
	prID3, _ := db.UpsertPR(store.DB, pr3)

	// Finalize PR1
	FinalizePR(store.DB, prID1, &db.PRMetrics{PRID: prID1})

	// PR2 gets metrics but not finalized
	db.UpsertPRMetrics(store.DB, &db.PRMetrics{PRID: prID2})

	// Finalize PR3
	FinalizePR(store.DB, prID3, &db.PRMetrics{PRID: prID3})

	// Should only get PR1 and PR3
	finalizedPRs, err := db.GetFinalizedPRsForRepo(store.DB, repoID)
	if err != nil {
		t.Fatalf("failed to get finalized PRs: %v", err)
	}
	if len(finalizedPRs) != 2 {
		t.Fatalf("expected 2 finalized PRs, got %d", len(finalizedPRs))
	}

	// Should be ordered by number DESC (3, 1)
	if finalizedPRs[0].Number != 3 {
		t.Errorf("expected first PR to be #3, got #%d", finalizedPRs[0].Number)
	}
	if finalizedPRs[1].Number != 1 {
		t.Errorf("expected second PR to be #1, got #%d", finalizedPRs[1].Number)
	}
}

func TestPreviousStateTracking(t *testing.T) {
	dir := t.TempDir()
	store, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	repoID, _ := db.UpsertRepo(store.DB, "/tmp/test-repo", "", "test", "repo")

	// Insert as open
	pr := &db.PR{
		RepoID: repoID,
		Number: 1,
		State:  sql.NullString{String: "open", Valid: true},
	}
	db.UpsertPR(store.DB, pr)

	// Update to merged
	pr.State = sql.NullString{String: "merged", Valid: true}
	db.UpsertPR(store.DB, pr)

	// Check previous_state
	var previousState sql.NullString
	store.DB.Get(&previousState, "SELECT previous_state FROM prs WHERE repo_id = ? AND number = 1", repoID)
	if !previousState.Valid || previousState.String != "open" {
		t.Errorf("expected previous_state 'open', got %v", previousState)
	}
}

func TestWatchedRepos(t *testing.T) {
	dir := t.TempDir()
	store, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	repoID, _ := db.UpsertRepo(store.DB, "/tmp/test-repo", "", "test", "repo")

	// Insert watched repo
	wr := &db.WatchedRepo{
		RepoID:              repoID,
		PollIntervalSeconds: 300,
		Enabled:             1,
	}
	if err := db.UpsertWatchedRepo(store.DB, wr); err != nil {
		t.Fatalf("failed to upsert watched repo: %v", err)
	}

	// Get enabled repos
	watched, err := db.GetEnabledWatchedRepos(store.DB)
	if err != nil {
		t.Fatalf("failed to get watched repos: %v", err)
	}
	if len(watched) != 1 {
		t.Fatalf("expected 1 watched repo, got %d", len(watched))
	}
	if watched[0].PollIntervalSeconds != 300 {
		t.Errorf("expected interval 300, got %d", watched[0].PollIntervalSeconds)
	}

	// Update polled time
	if err := db.UpdateWatchedRepoPolledAt(store.DB, repoID); err != nil {
		t.Fatalf("failed to update polled time: %v", err)
	}

	// Verify polled time is set
	watched, _ = db.GetEnabledWatchedRepos(store.DB)
	if !watched[0].LastPolledAt.Valid {
		t.Error("expected last_polled_at to be set")
	}

	// Delete
	if err := db.DeleteWatchedRepo(store.DB, repoID); err != nil {
		t.Fatalf("failed to delete watched repo: %v", err)
	}
	watched, _ = db.GetEnabledWatchedRepos(store.DB)
	if len(watched) != 0 {
		t.Errorf("expected 0 watched repos after delete, got %d", len(watched))
	}
}
