// Package metrics calculates agentic coding DX metrics from parsed data.
package metrics

import (
	"strings"

	"github.com/austinroos/ax/internal/parsers"
)

// testFilePatterns are globs/substrings that indicate a file is a test file.
// testFileContains are substrings that indicate a test file when found anywhere in the path.
var testFileContains = []string{
	".test.",
	".spec.",
	"_test.",
	"_test/",
	"__tests__/",
	"/test/",
	"/tests/",
}

// testFilePrefixes are prefixes that indicate a test file.
var testFilePrefixes = []string{
	"test/",
	"tests/",
}

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

// FirstPassAccepted returns true if the PR was never given a CHANGES_REQUESTED review.
func FirstPassAccepted(reviews []parsers.GHReview) bool {
	return !parsers.HasChangesRequested(reviews)
}

// CISuccessRate returns the fraction of CI checks that passed (0.0 to 1.0).
// Returns -1 if no checks exist.
func CISuccessRate(checks []parsers.GHCheckRun) float64 {
	return parsers.CIPassRate(checks)
}

// HasTestFiles checks whether any of the changed files appear to be test files.
func HasTestFiles(files []string) bool {
	for _, f := range files {
		lower := strings.ToLower(f)
		for _, pattern := range testFileContains {
			if strings.Contains(lower, pattern) {
				return true
			}
		}
		for _, prefix := range testFilePrefixes {
			if strings.HasPrefix(lower, prefix) {
				return true
			}
		}
	}
	return false
}

// DiffChurn calculates wasted lines — lines that were added in intermediate
// commits but don't appear in the final diff.
//
// totalAdded is the sum of additions across all individual commits on the branch.
// netAdded is the additions in the final squashed diff (base...head).
//
// Churn = totalAdded - netAdded (clamped to 0).
func DiffChurn(totalAdded, netAdded int) int {
	churn := totalAdded - netAdded
	if churn < 0 {
		return 0
	}
	return churn
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
