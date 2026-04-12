package parsers

import "strings"

// GHPullRequest represents a GitHub pull request.
type GHPullRequest struct {
	Number       int    `json:"number"`
	Title        string `json:"title"`
	HeadRefName  string `json:"headRefName"`
	State        string `json:"state"`
	URL          string `json:"url"`
	CreatedAt    string `json:"createdAt"`
	MergedAt     string `json:"mergedAt"`
	ClosedAt     string `json:"closedAt"`
	Additions    int    `json:"additions"`
	Deletions    int    `json:"deletions"`
	ChangedFiles int    `json:"changedFiles"`
	Author       struct {
		Login string `json:"login"`
	} `json:"author"`
}

// GHReview represents a GitHub PR review.
type GHReview struct {
	Author string `json:"author"`
	State  string `json:"state"` // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
	Body   string `json:"body"`
}

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

// HasChangesRequested returns true if any review on the PR requested changes.
func HasChangesRequested(reviews []GHReview) bool {
	for _, r := range reviews {
		if r.State == "CHANGES_REQUESTED" {
			return true
		}
	}
	return false
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
