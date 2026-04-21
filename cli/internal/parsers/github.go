package parsers

import "strings"

// GHCheckRun represents a CI check result.
type GHCheckRun struct {
	Name       string `json:"name"`
	Status     string `json:"status"`     // completed, in_progress, queued
	Conclusion string `json:"conclusion"` // success, failure, neutral, cancelled, skipped, timed_out
}

// GHCommit represents a commit from a GitHub PR.
type GHCommit struct {
	SHA             string `json:"oid"`
	MessageBody     string `json:"messageBody"`
	MessageHeadline string `json:"messageHeadline"`
	CommittedDate   string `json:"committedDate"`
	Authors         []struct {
		Name string `json:"name"`
	} `json:"authors"`
}

// CIPassRate calculates the percentage of checks that passed.
// Returns -1 if there are no completed checks.
// Handles both uppercase (GitHub API) and lowercase values.
func CIPassRate(checks []GHCheckRun) float64 {
	var completed, passed int
	for _, c := range checks {
		status := strings.ToUpper(c.Status)
		conclusion := strings.ToUpper(c.Conclusion)
		if status == "COMPLETED" || conclusion != "" {
			completed++
			if conclusion == "SUCCESS" || conclusion == "SKIPPED" || conclusion == "NEUTRAL" {
				passed++
			}
		}
	}
	if completed == 0 {
		return -1
	}
	return float64(passed) / float64(completed)
}
