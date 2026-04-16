package metrics

import (
	"testing"

	"github.com/austinroos/ax/internal/parsers"
)

func TestPostOpenCommits(t *testing.T) {
	commits := []parsers.GHCommit{
		{CommittedDate: "2024-01-01T10:00:00Z"},
		{CommittedDate: "2024-01-02T10:00:00Z"},
		{CommittedDate: "2024-01-03T10:00:00Z"},
	}

	got := PostOpenCommits(commits, "2024-01-01T12:00:00Z")
	if got != 2 {
		t.Errorf("expected 2 post-open commits, got %d", got)
	}

	got = PostOpenCommits(commits, "2024-01-04T00:00:00Z")
	if got != 0 {
		t.Errorf("expected 0 post-open commits, got %d", got)
	}
}

func TestCalculateLineRevisits(t *testing.T) {
	prFiles := map[int][]string{
		1: {"src/main.go", "src/utils.go", "README.md"},
		2: {"src/main.go", "src/db.go"},
		3: {"src/main.go", "src/utils.go", "src/new.go"},
	}

	results := CalculateLineRevisits(prFiles)

	if len(results) != 2 {
		t.Fatalf("expected 2 revisited files, got %d", len(results))
	}

	// main.go should be first (3 PRs)
	if results[0].File != "src/main.go" {
		t.Errorf("expected src/main.go first, got %s", results[0].File)
	}
	if results[0].RevisitCount != 3 {
		t.Errorf("expected 3 revisits for main.go, got %d", results[0].RevisitCount)
	}

	// utils.go should be second (2 PRs)
	if results[1].File != "src/utils.go" {
		t.Errorf("expected src/utils.go second, got %s", results[1].File)
	}
	if results[1].RevisitCount != 2 {
		t.Errorf("expected 2 revisits for utils.go, got %d", results[1].RevisitCount)
	}
}
