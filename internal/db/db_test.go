package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenAndMigrate(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	store, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	// Verify the database file was created
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Fatal("database file was not created")
	}

	// Verify tables exist
	tables := []string{"repos", "sessions", "prs", "commits", "session_prs", "pr_metrics", "plan_analyses", "repo_metrics", "watched_repos", "schema_migrations"}
	for _, table := range tables {
		var name string
		err := store.DB.Get(&name, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", table)
		if err != nil {
			t.Errorf("table %s does not exist: %v", table, err)
		}
	}

	// Verify dialect
	if store.Dialect != DialectSQLite {
		t.Errorf("expected SQLite dialect, got %s", store.Dialect)
	}
}

func TestUpsertRepo(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	// Insert a repo
	id, err := UpsertRepo(store.DB, "/tmp/test-repo", "https://github.com/test/repo.git", "test", "repo")
	if err != nil {
		t.Fatalf("failed to upsert repo: %v", err)
	}
	if id == 0 {
		t.Fatal("expected non-zero repo ID")
	}

	// Verify it was inserted
	repo, err := GetRepoByPath(store.DB, "/tmp/test-repo")
	if err != nil {
		t.Fatalf("failed to get repo: %v", err)
	}
	if repo == nil {
		t.Fatal("expected repo to exist")
	}
	if repo.GithubOwner.String != "test" {
		t.Errorf("expected owner 'test', got '%s'", repo.GithubOwner.String)
	}

	// Upsert again (update)
	id2, err := UpsertRepo(store.DB, "/tmp/test-repo", "https://github.com/test/repo2.git", "test", "repo2")
	if err != nil {
		t.Fatalf("failed to upsert repo: %v", err)
	}
	if id2 != id {
		t.Errorf("expected same ID %d, got %d", id, id2)
	}

	// Verify update
	repo, err = GetRepoByPath(store.DB, "/tmp/test-repo")
	if err != nil {
		t.Fatalf("failed to get repo: %v", err)
	}
	if repo.GithubRepo.String != "repo2" {
		t.Errorf("expected repo name 'repo2', got '%s'", repo.GithubRepo.String)
	}
}

func TestUpsertPRAndMetrics(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	repoID, err := UpsertRepo(store.DB, "/tmp/test-repo", "", "", "")
	if err != nil {
		t.Fatalf("failed to upsert repo: %v", err)
	}

	pr := &PR{
		RepoID: repoID,
		Number: 42,
	}
	prID, err := UpsertPR(store.DB, pr)
	if err != nil {
		t.Fatalf("failed to upsert PR: %v", err)
	}
	if prID == 0 {
		t.Fatal("expected non-zero PR ID")
	}

	// Verify metrics can be stored and retrieved
	metrics := &PRMetrics{
		PRID: prID,
	}
	if err := UpsertPRMetrics(store.DB, metrics); err != nil {
		t.Fatalf("failed to upsert metrics: %v", err)
	}

	got, err := GetPRMetrics(store.DB, prID)
	if err != nil {
		t.Fatalf("failed to get metrics: %v", err)
	}
	if got == nil {
		t.Fatal("expected metrics to exist")
	}
	if got.PRID != prID {
		t.Errorf("expected PR ID %d, got %d", prID, got.PRID)
	}
}

func TestMigrationV2_TokenColumns(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	// Verify v2 migration applied — sessions should have token columns
	_, err = store.DB.Exec(`INSERT INTO sessions (id, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, total_cost_usd, primary_model)
		VALUES ('test-session', 1000, 500, 200, 300, 0.05, 'claude-sonnet-4-6')`)
	if err != nil {
		t.Fatalf("failed to insert session with token columns: %v", err)
	}

	var session Session
	err = store.DB.Get(&session, "SELECT * FROM sessions WHERE id = 'test-session'")
	if err != nil {
		t.Fatalf("failed to get session: %v", err)
	}
	if session.InputTokens != 1000 {
		t.Errorf("expected input_tokens 1000, got %d", session.InputTokens)
	}
	if !session.TotalCostUSD.Valid || session.TotalCostUSD.Float64 != 0.05 {
		t.Errorf("expected total_cost_usd 0.05, got %v", session.TotalCostUSD)
	}

	// Verify repo_metrics table works
	repoID, _ := UpsertRepo(store.DB, "/tmp/test", "", "", "")
	rm := &RepoMetrics{
		RepoID:          repoID,
		PeriodStart:     "2026-03-01",
		PeriodEnd:       "2026-03-31",
		PeriodType:      "month",
		TotalSessions:   10,
		TotalTokens:     500000,
		TotalCostUSD:    25.50,
		UnmergedTokens:  50000,
		UnmergedCostUSD: 2.55,
	}
	if err := UpsertRepoMetrics(store.DB, rm); err != nil {
		t.Fatalf("failed to upsert repo metrics: %v", err)
	}

	got, err := GetRepoMetrics(store.DB, repoID, "month")
	if err != nil {
		t.Fatalf("failed to get repo metrics: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 repo metric, got %d", len(got))
	}
	if got[0].TotalCostUSD != 25.50 {
		t.Errorf("expected total_cost_usd 25.50, got %.2f", got[0].TotalCostUSD)
	}
}
