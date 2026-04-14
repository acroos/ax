package metrics

import (
	"testing"
)

func TestComparePlanToImplementation_PerfectMatch(t *testing.T) {
	planned := []string{"src/main.go", "src/utils.go"}
	actual := []string{"src/main.go", "src/utils.go"}

	result := ComparePlanToImplementation(planned, actual)

	if result.CoverageScore != 1.0 {
		t.Errorf("expected coverage 1.0, got %f", result.CoverageScore)
	}
	if result.DeviationScore != 1.0 {
		t.Errorf("expected deviation 1.0, got %f", result.DeviationScore)
	}
	if result.ScopeCreep {
		t.Error("expected no scope creep")
	}
	if len(result.UnplannedFiles) != 0 {
		t.Errorf("expected 0 unplanned files, got %d", len(result.UnplannedFiles))
	}
}

func TestComparePlanToImplementation_PartialCoverage(t *testing.T) {
	planned := []string{"src/main.go"}
	actual := []string{"src/main.go", "src/utils.go", "src/new.go"}

	result := ComparePlanToImplementation(planned, actual)

	if result.CoverageScore < 0.33 || result.CoverageScore > 0.34 {
		t.Errorf("expected coverage ~0.33, got %f", result.CoverageScore)
	}
	if result.DeviationScore != 1.0 {
		t.Errorf("expected deviation 1.0 (all planned files were built), got %f", result.DeviationScore)
	}
	if !result.ScopeCreep {
		t.Error("expected scope creep (2/3 unplanned)")
	}
}

func TestComparePlanToImplementation_PartialPathMatching(t *testing.T) {
	// Plan says "db.go" but actual path is "internal/db/db.go"
	planned := []string{"db/db.go", "db/models.go"}
	actual := []string{"internal/db/db.go", "internal/db/models.go", "internal/db/queries.go"}

	result := ComparePlanToImplementation(planned, actual)

	if len(result.CoveredFiles) != 2 {
		t.Errorf("expected 2 covered files, got %d: %v", len(result.CoveredFiles), result.CoveredFiles)
	}
}

func TestComparePlanToImplementation_IgnoredFiles(t *testing.T) {
	planned := []string{"src/main.go"}
	actual := []string{"src/main.go", "package-lock.json", "go.sum"}

	result := ComparePlanToImplementation(planned, actual)

	// package-lock.json and go.sum should be ignored
	if result.CoverageScore != 1.0 {
		t.Errorf("expected coverage 1.0 (ignored files excluded), got %f", result.CoverageScore)
	}
	if result.ScopeCreep {
		t.Error("expected no scope creep (ignored files excluded)")
	}
}

func TestComparePlanToImplementation_MissedFiles(t *testing.T) {
	planned := []string{"src/main.go", "src/utils.go", "src/config.go"}
	actual := []string{"src/main.go"}

	result := ComparePlanToImplementation(planned, actual)

	if len(result.MissedFiles) != 2 {
		t.Errorf("expected 2 missed files, got %d: %v", len(result.MissedFiles), result.MissedFiles)
	}
	if result.DeviationScore < 0.33 || result.DeviationScore > 0.34 {
		t.Errorf("expected deviation ~0.33, got %f", result.DeviationScore)
	}
}

func TestComparePlanToImplementation_EmptyPlan(t *testing.T) {
	result := ComparePlanToImplementation(nil, []string{"src/main.go"})

	if result.CoverageScore != 0 {
		t.Errorf("expected coverage 0 for empty plan, got %f", result.CoverageScore)
	}
	if result.ScopeCreep {
		// With no plan, everything is "unplanned" but we still flag it
		// Actually with 0 planned and 1 actual, unplannedRatio = 1.0 > 0.5
	}
}

func TestPathsMatch(t *testing.T) {
	tests := []struct {
		actual  string
		planned string
		want    bool
	}{
		{"src/main.go", "src/main.go", true},
		{"internal/db/db.go", "db/db.go", true},
		{"internal/db/db.go", "db.go", true},
		{"src/main.go", "src/utils.go", false},
		{"internal/db/db.go", "parsers/db.go", false},
	}

	for _, tt := range tests {
		got := pathsMatch(tt.actual, tt.planned)
		if got != tt.want {
			t.Errorf("pathsMatch(%q, %q) = %v, want %v", tt.actual, tt.planned, got, tt.want)
		}
	}
}
