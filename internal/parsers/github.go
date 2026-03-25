package parsers

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// GHPullRequest represents a GitHub pull request from the gh CLI.
type GHPullRequest struct {
	Number       int    `json:"number"`
	Title        string `json:"title"`
	HeadRefName  string `json:"headRefName"`
	State        string `json:"state"`
	URL          string `json:"url"`
	CreatedAt    string `json:"createdAt"`
	MergedAt    string `json:"mergedAt"`
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

// ghReviewWrapper wraps the nested author object from gh CLI output.
type ghReviewWrapper struct {
	Author struct {
		Login string `json:"login"`
	} `json:"author"`
	State string `json:"state"`
	Body  string `json:"body"`
}

// GHCheckRun represents a CI check result.
type GHCheckRun struct {
	Name       string `json:"name"`
	Status     string `json:"status"`     // completed, in_progress, queued
	Conclusion string `json:"conclusion"` // success, failure, neutral, cancelled, skipped, timed_out
}

// GHCommit represents a commit from a GitHub PR.
type GHCommit struct {
	SHA         string `json:"oid"`
	MessageBody string `json:"messageBody"`
	MessageHeadline string `json:"messageHeadline"`
	CommittedDate   string `json:"committedDate"`
	Authors     []struct {
		Name string `json:"name"`
	} `json:"authors"`
}

// GitHubParser fetches data from GitHub via the gh CLI.
type GitHubParser struct {
	owner string
	repo  string
}

// NewGitHubParser creates a parser for the given GitHub owner/repo.
func NewGitHubParser(owner, repo string) *GitHubParser {
	return &GitHubParser{owner: owner, repo: repo}
}

// gh runs a gh CLI command and returns stdout.
func (g *GitHubParser) gh(args ...string) (string, error) {
	cmd := exec.Command("gh", args...)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("gh %s failed: %s\n%s", strings.Join(args, " "), err, string(exitErr.Stderr))
		}
		return "", fmt.Errorf("gh %s failed: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(out)), nil
}

// repoFlag returns the -R flag value for gh commands.
func (g *GitHubParser) repoFlag() string {
	return g.owner + "/" + g.repo
}

// ListPRs returns pull requests for the repository.
// state can be "open", "closed", "merged", or "all".
func (g *GitHubParser) ListPRs(state string, limit int) ([]GHPullRequest, error) {
	if limit <= 0 {
		limit = 100
	}
	out, err := g.gh("pr", "list",
		"-R", g.repoFlag(),
		"--state", state,
		"--limit", fmt.Sprintf("%d", limit),
		"--json", "number,title,headRefName,state,url,createdAt,mergedAt,closedAt,additions,deletions,changedFiles,author",
	)
	if err != nil {
		return nil, err
	}

	var prs []GHPullRequest
	if err := json.Unmarshal([]byte(out), &prs); err != nil {
		return nil, fmt.Errorf("failed to parse PR list: %w", err)
	}
	return prs, nil
}

// GetPR returns a single pull request by number.
func (g *GitHubParser) GetPR(number int) (*GHPullRequest, error) {
	out, err := g.gh("pr", "view",
		"-R", g.repoFlag(),
		fmt.Sprintf("%d", number),
		"--json", "number,title,headRefName,state,url,createdAt,mergedAt,closedAt,additions,deletions,changedFiles,author",
	)
	if err != nil {
		return nil, err
	}

	var pr GHPullRequest
	if err := json.Unmarshal([]byte(out), &pr); err != nil {
		return nil, fmt.Errorf("failed to parse PR: %w", err)
	}
	return &pr, nil
}

// GetPRReviews returns reviews for a pull request.
func (g *GitHubParser) GetPRReviews(number int) ([]GHReview, error) {
	out, err := g.gh("api",
		fmt.Sprintf("repos/%s/pulls/%d/reviews", g.repoFlag(), number),
		"--jq", ".",
	)
	if err != nil {
		return nil, err
	}

	var wrappers []ghReviewWrapper
	if err := json.Unmarshal([]byte(out), &wrappers); err != nil {
		return nil, fmt.Errorf("failed to parse reviews: %w", err)
	}

	var reviews []GHReview
	for _, w := range wrappers {
		reviews = append(reviews, GHReview{
			Author: w.Author.Login,
			State:  w.State,
			Body:   w.Body,
		})
	}
	return reviews, nil
}

// GetPRCommits returns commits for a pull request.
func (g *GitHubParser) GetPRCommits(number int) ([]GHCommit, error) {
	out, err := g.gh("pr", "view",
		"-R", g.repoFlag(),
		fmt.Sprintf("%d", number),
		"--json", "commits",
	)
	if err != nil {
		return nil, err
	}

	var result struct {
		Commits []GHCommit `json:"commits"`
	}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse commits: %w", err)
	}
	return result.Commits, nil
}

// GetPRChecks returns CI check results for a pull request.
// Uses statusCheckRollup from the PR view API for reliable cross-version support.
func (g *GitHubParser) GetPRChecks(number int) ([]GHCheckRun, error) {
	out, err := g.gh("pr", "view",
		"-R", g.repoFlag(),
		fmt.Sprintf("%d", number),
		"--json", "statusCheckRollup",
	)
	if err != nil {
		return nil, err
	}

	var result struct {
		StatusCheckRollup []struct {
			Name       string `json:"name"`
			Status     string `json:"status"`
			Conclusion string `json:"conclusion"`
		} `json:"statusCheckRollup"`
	}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse status checks: %w", err)
	}

	var checks []GHCheckRun
	for _, c := range result.StatusCheckRollup {
		checks = append(checks, GHCheckRun{
			Name:       c.Name,
			Status:     c.Status,
			Conclusion: c.Conclusion,
		})
	}
	return checks, nil
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
