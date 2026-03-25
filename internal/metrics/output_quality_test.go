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

func TestFirstPassAccepted(t *testing.T) {
	tests := []struct {
		name    string
		reviews []parsers.GHReview
		want    bool
	}{
		{
			name:    "no reviews",
			reviews: nil,
			want:    true,
		},
		{
			name:    "only approvals",
			reviews: []parsers.GHReview{{State: "APPROVED"}, {State: "COMMENTED"}},
			want:    true,
		},
		{
			name:    "changes requested",
			reviews: []parsers.GHReview{{State: "APPROVED"}, {State: "CHANGES_REQUESTED"}},
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FirstPassAccepted(tt.reviews)
			if got != tt.want {
				t.Errorf("FirstPassAccepted = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHasTestFiles(t *testing.T) {
	tests := []struct {
		name  string
		files []string
		want  bool
	}{
		{"no test files", []string{"src/main.go", "lib/utils.go"}, false},
		{"jest test", []string{"src/main.ts", "src/main.test.ts"}, true},
		{"spec file", []string{"app.spec.js"}, true},
		{"go test", []string{"db_test.go"}, true},
		{"__tests__ dir", []string{"__tests__/app.test.tsx"}, true},
		{"test directory", []string{"test/integration.js"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := HasTestFiles(tt.files)
			if got != tt.want {
				t.Errorf("HasTestFiles = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDiffChurn(t *testing.T) {
	if got := DiffChurn(100, 80); got != 20 {
		t.Errorf("DiffChurn(100, 80) = %d, want 20", got)
	}
	if got := DiffChurn(50, 50); got != 0 {
		t.Errorf("DiffChurn(50, 50) = %d, want 0", got)
	}
	if got := DiffChurn(30, 50); got != 0 {
		t.Errorf("DiffChurn(30, 50) = %d, want 0 (clamped)", got)
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
