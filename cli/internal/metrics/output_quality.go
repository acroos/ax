// Package metrics calculates agentic coding DX metrics from parsed data.
package metrics

import (
	"github.com/austinroos/ax/internal/parsers"
)

// PostOpenCommits counts how many commits were made after the PR was opened.
// prCreatedAt should be an ISO 8601 timestamp.
func PostOpenCommits(commits []parsers.GHCommit, prCreatedAt string) int {
	count := 0
	for _, c := range commits {
		if c.CommittedDate > prCreatedAt {
			count++
		}
	}
	return count
}

// CISuccessRate returns the fraction of CI checks that passed (0.0 to 1.0).
// Returns -1 if no checks exist.
func CISuccessRate(checks []parsers.GHCheckRun) float64 {
	return parsers.CIPassRate(checks)
}

// LineRevisitInfo tracks how many times lines in a file have been modified
// across different PRs.
type LineRevisitInfo struct {
	File         string
	RevisitCount int   // number of PRs that touched this file
	PRNumbers    []int // which PRs touched it
}

// CalculateLineRevisits identifies files that were modified in multiple PRs.
// This is a simplified version — it operates at the file level rather than
// individual line ranges (which requires more complex blame analysis).
//
// Returns files sorted by revisit count (highest first).
func CalculateLineRevisits(prFiles map[int][]string) []LineRevisitInfo {
	// Map file -> list of PR numbers that touched it
	fileHits := make(map[string][]int)
	for prNum, files := range prFiles {
		seen := make(map[string]bool) // dedupe within a PR
		for _, f := range files {
			if !seen[f] {
				fileHits[f] = append(fileHits[f], prNum)
				seen[f] = true
			}
		}
	}

	var results []LineRevisitInfo
	for file, prs := range fileHits {
		if len(prs) > 1 {
			results = append(results, LineRevisitInfo{
				File:         file,
				RevisitCount: len(prs),
				PRNumbers:    prs,
			})
		}
	}

	// Sort by revisit count descending
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].RevisitCount > results[i].RevisitCount {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	return results
}
