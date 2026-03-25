package metrics

import (
	"path/filepath"
	"strings"
)

// PlanMetrics contains the results of comparing a plan to actual implementation.
type PlanMetrics struct {
	CoverageScore     float64  // 0.0-1.0: what fraction of actual files were planned
	DeviationScore    float64  // 0.0-1.0: what fraction of planned files were actually changed
	ScopeCreep        bool     // true if unplanned files exceed a threshold
	PlannedFiles      []string // files mentioned in the plan
	ActualFiles       []string // files actually changed in the PR
	CoveredFiles      []string // files that appear in both plan and diff
	UnplannedFiles    []string // files changed but not in the plan
	MissedFiles       []string // files in the plan but not changed
}

// ignoredFiles are files that are expected to change without being explicitly planned.
var ignoredFiles = map[string]bool{
	"package-lock.json": true,
	"package.json":      true,
	"go.sum":            true,
	"go.mod":            true,
	"yarn.lock":         true,
	"pnpm-lock.yaml":    true,
	"Cargo.lock":        true,
	"Gemfile.lock":      true,
}

// ComparePlanToImplementation analyzes how well a plan predicted the actual changes.
//
// plannedFiles: file paths extracted from the plan markdown
// actualFiles: files changed in the PR diff
//
// Coverage = |planned ∩ actual| / |actual - ignored|
//   "How much of what we built was planned?"
//
// Deviation = |planned ∩ actual| / |planned|
//   "How much of what we planned did we actually build?"
//
// Scope creep = |unplanned| / |actual - ignored| > 0.5
//   "Did more than half the changes come from outside the plan?"
func ComparePlanToImplementation(plannedFiles, actualFiles []string) *PlanMetrics {
	result := &PlanMetrics{
		PlannedFiles: plannedFiles,
		ActualFiles:  actualFiles,
	}

	if len(plannedFiles) == 0 && len(actualFiles) == 0 {
		return result
	}

	// Normalize planned file paths — plans may use relative paths or partial paths
	plannedSet := make(map[string]bool)
	plannedBases := make(map[string]bool) // just the filename for fuzzy matching
	for _, f := range plannedFiles {
		normalized := normalizePath(f)
		plannedSet[normalized] = true
		plannedBases[filepath.Base(normalized)] = true
	}

	// Filter actual files, removing ignored ones
	var filteredActual []string
	for _, f := range actualFiles {
		base := filepath.Base(f)
		if !ignoredFiles[base] {
			filteredActual = append(filteredActual, f)
		}
	}

	// Find matches: a planned file matches an actual file if:
	// 1. Exact match after normalization, OR
	// 2. The actual file path ends with the planned path (partial match)
	matchedPlanned := make(map[string]bool)
	matchedActual := make(map[string]bool)

	for _, actual := range filteredActual {
		normalizedActual := normalizePath(actual)
		for _, planned := range plannedFiles {
			normalizedPlanned := normalizePath(planned)
			if pathsMatch(normalizedActual, normalizedPlanned) {
				matchedPlanned[planned] = true
				matchedActual[actual] = true
				result.CoveredFiles = append(result.CoveredFiles, actual)
				break
			}
		}
	}

	// Unplanned files: changed but not in the plan
	for _, f := range filteredActual {
		if !matchedActual[f] {
			result.UnplannedFiles = append(result.UnplannedFiles, f)
		}
	}

	// Missed files: planned but not changed
	for _, f := range plannedFiles {
		if !matchedPlanned[f] {
			result.MissedFiles = append(result.MissedFiles, f)
		}
	}

	// Calculate scores
	if len(filteredActual) > 0 {
		result.CoverageScore = float64(len(result.CoveredFiles)) / float64(len(filteredActual))
	}
	if len(plannedFiles) > 0 {
		result.DeviationScore = float64(len(result.CoveredFiles)) / float64(len(plannedFiles))
	}

	// Scope creep: more than half the actual changes were unplanned
	if len(filteredActual) > 0 {
		unplannedRatio := float64(len(result.UnplannedFiles)) / float64(len(filteredActual))
		result.ScopeCreep = unplannedRatio > 0.5
	}

	return result
}

// normalizePath strips leading ./ and /, lowercases, and cleans the path.
func normalizePath(p string) string {
	p = strings.TrimPrefix(p, "./")
	p = strings.TrimPrefix(p, "/")
	return filepath.Clean(p)
}

// pathsMatch returns true if two paths refer to the same file.
// Handles partial paths — if the planned path is "db.go" it matches "internal/db/db.go".
func pathsMatch(actual, planned string) bool {
	if actual == planned {
		return true
	}
	// Check if actual ends with planned (partial path match)
	if strings.HasSuffix(actual, "/"+planned) {
		return true
	}
	// Check if filenames match (weakest match)
	if filepath.Base(actual) == filepath.Base(planned) && filepath.Base(planned) != "" {
		// Only match on basename if the planned path has no directory component
		if !strings.Contains(planned, "/") {
			return true
		}
	}
	return false
}
