package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenAndMigrate(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	// Verify the database file was created
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Fatal("database file was not created")
	}

	// Verify tables exist
	tables := []string{"repos", "sessions", "prs", "commits", "session_prs", "pr_metrics", "plan_analyses", "schema_migrations"}
	for _, table := range tables {
		var name string
		err := db.Get(&name, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", table)
		if err != nil {
			t.Errorf("table %s does not exist: %v", table, err)
		}
	}
}

func TestUpsertRepo(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	// Insert a repo
	id, err := UpsertRepo(db, "/tmp/test-repo", "https://github.com/test/repo.git", "test", "repo")
	if err != nil {
		t.Fatalf("failed to upsert repo: %v", err)
	}
	if id == 0 {
		t.Fatal("expected non-zero repo ID")
	}

	// Verify it was inserted
	repo, err := GetRepoByPath(db, "/tmp/test-repo")
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
	id2, err := UpsertRepo(db, "/tmp/test-repo", "https://github.com/test/repo2.git", "test", "repo2")
	if err != nil {
		t.Fatalf("failed to upsert repo: %v", err)
	}
	if id2 != id {
		t.Errorf("expected same ID %d, got %d", id, id2)
	}

	// Verify update
	repo, err = GetRepoByPath(db, "/tmp/test-repo")
	if err != nil {
		t.Fatalf("failed to get repo: %v", err)
	}
	if repo.GithubRepo.String != "repo2" {
		t.Errorf("expected repo name 'repo2', got '%s'", repo.GithubRepo.String)
	}
}

func TestUpsertPRAndMetrics(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	repoID, err := UpsertRepo(db, "/tmp/test-repo", "", "", "")
	if err != nil {
		t.Fatalf("failed to upsert repo: %v", err)
	}

	pr := &PR{
		RepoID: repoID,
		Number: 42,
	}
	prID, err := UpsertPR(db, pr)
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
	if err := UpsertPRMetrics(db, metrics); err != nil {
		t.Fatalf("failed to upsert metrics: %v", err)
	}

	got, err := GetPRMetrics(db, prID)
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
