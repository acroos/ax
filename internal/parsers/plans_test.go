package parsers

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParsePlanFile(t *testing.T) {
	// Create a test plan file
	dir := t.TempDir()
	planPath := filepath.Join(dir, "test-plan.md")

	content := `# Implementation Plan

## Step 1: Database Layer
- Create ` + "`internal/db/db.go`" + ` with schema
- Create ` + "`internal/db/models.go`" + ` with types
- Create ` + "`internal/db/queries.go`" + ` with CRUD operations

## Step 2: Parsers
` + "```" + `
internal/parsers/git.go     — git log parser
internal/parsers/github.go  — GitHub API parser
` + "```" + `

## Step 3: CLI
Update cmd/ax/main.go to wire everything together.
Also need to modify dashboard/src/app/page.tsx.
`

	if err := os.WriteFile(planPath, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	analysis, err := ParsePlanFile(planPath)
	if err != nil {
		t.Fatal(err)
	}

	if len(analysis.PlannedFiles) == 0 {
		t.Fatal("expected to find file paths in plan")
	}

	t.Logf("Found %d planned files:", len(analysis.PlannedFiles))
	for _, f := range analysis.PlannedFiles {
		t.Logf("  %s", f)
	}

	// Check specific files are found
	found := make(map[string]bool)
	for _, f := range analysis.PlannedFiles {
		found[f] = true
	}

	expected := []string{"internal/db/db.go", "internal/db/models.go", "internal/db/queries.go"}
	for _, e := range expected {
		if !found[e] {
			t.Errorf("expected to find %q in planned files", e)
		}
	}
}

func TestParsePlanFile_RealPlan(t *testing.T) {
	// Test against our own plan file
	planPath := filepath.Join("..", "..", "plans", "phase-1-plan.md")
	if _, err := os.Stat(planPath); os.IsNotExist(err) {
		t.Skip("no plans/phase-1-plan.md found")
	}

	analysis, err := ParsePlanFile(planPath)
	if err != nil {
		t.Fatal(err)
	}

	t.Logf("Found %d planned files in phase-1-plan.md", len(analysis.PlannedFiles))
	for _, f := range analysis.PlannedFiles[:min(10, len(analysis.PlannedFiles))] {
		t.Logf("  %s", f)
	}

	if len(analysis.PlannedFiles) == 0 {
		t.Error("expected to find file paths in the real plan")
	}
}

func TestIsVersionNumber(t *testing.T) {
	tests := []struct {
		s    string
		want bool
	}{
		{"0.75", true},
		{"2.7", true},
		{"src/main.go", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := isVersionNumber(tt.s); got != tt.want {
			t.Errorf("isVersionNumber(%q) = %v, want %v", tt.s, got, tt.want)
		}
	}
}
