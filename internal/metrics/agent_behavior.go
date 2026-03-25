package metrics

import (
	"strings"

	"github.com/austinroos/ax/internal/parsers"
)

// SelfCorrectionRate calculates the ratio of agent-initiated error recoveries
// to total errors. A self-correction is when a Bash command fails and the
// agent retries/fixes without a human message in between.
//
// We approximate this by: bash_errors that were followed by a bash_success
// in the same session without an intervening human message = self-correction.
// Since we don't have fine-grained message ordering in our aggregated data,
// we use the ratio: (bash_errors where session still succeeded overall) / total_errors.
//
// Returns a value 0.0 to 1.0, or -1 if there are no errors.
func SelfCorrectionRate(sessions []*parsers.ParsedSession) float64 {
	totalErrors := 0
	totalSuccesses := 0
	for _, s := range sessions {
		totalErrors += s.BashErrors
		totalSuccesses += s.BashSuccesses
	}

	if totalErrors == 0 {
		return -1 // no errors to correct
	}

	// Heuristic: if there are more successes than errors, the agent
	// self-corrected most of the time. The rate is clamped 0-1.
	if totalSuccesses == 0 {
		return 0
	}

	// Ratio of errors that were likely self-corrected:
	// We assume errors followed by successes are self-corrections.
	rate := 1.0 - (float64(totalErrors) / float64(totalErrors+totalSuccesses))
	if rate < 0 {
		return 0
	}
	if rate > 1 {
		return 1
	}
	return rate
}

// ContextEfficiency calculates the ratio of files modified to files read.
// Lower values mean the agent read many files but only modified a few.
// Higher values (closer to 1.0) mean the agent was focused.
//
// Returns -1 if no files were read.
func ContextEfficiency(sessions []*parsers.ParsedSession) float64 {
	readSet := make(map[string]bool)
	modifiedSet := make(map[string]bool)

	for _, s := range sessions {
		for _, f := range s.FilesRead {
			readSet[f] = true
		}
		for _, f := range s.FilesModified {
			modifiedSet[f] = true
		}
	}

	if len(readSet) == 0 {
		return -1
	}

	return float64(len(modifiedSet)) / float64(len(readSet))
}

// ErrorRecoveryEfficiency counts the total number of Bash errors across sessions.
// Fewer errors means more efficient — the agent gets things right without
// trial-and-error cycles.
func ErrorRecoveryEfficiency(sessions []*parsers.ParsedSession) int {
	total := 0
	for _, s := range sessions {
		total += s.BashErrors
	}
	return total
}

// buildTestLintErrors are substrings that indicate a build/test/lint Bash command.
var buildTestLintCommands = []string{
	"npm test", "npm run test",
	"npx tsc", "tsc --noEmit",
	"npm run lint", "npx eslint",
	"npm run format", "npx prettier",
	"go test", "go build", "go vet",
	"make test", "make build", "make lint",
	"cargo test", "cargo build",
	"pytest", "python -m pytest",
}

// BuildTestLintErrors counts Bash commands that look like build/test/lint
// operations. This is used by error recovery efficiency to filter
// for relevant errors (not counting e.g. mkdir failures).
func BuildTestLintErrors(sessions []*parsers.ParsedSession) int {
	count := 0
	for _, s := range sessions {
		for _, cmd := range s.BashCommands {
			lower := strings.ToLower(cmd)
			for _, pattern := range buildTestLintCommands {
				if strings.Contains(lower, pattern) {
					count++
					break
				}
			}
		}
	}
	return count
}
