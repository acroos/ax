// Package events defines the normalized event model for webhook-based ingestion.
// Platform-specific webhooks (GitHub, GitLab, Jira, Linear) are translated into
// normalized events and dispatched to handlers.
package events

import "time"

// EventType identifies the kind of normalized event.
type EventType string

const (
	EventPROpened        EventType = "pr_opened"
	EventPRSynchronized  EventType = "pr_synchronized"
	EventPRMerged        EventType = "pr_merged"
	EventPRClosed        EventType = "pr_closed"
	EventReviewSubmitted EventType = "review_submitted"
	EventCICompleted     EventType = "ci_completed"
	EventIssueUpdated    EventType = "issue_updated"
)

// Platform identifies the source platform.
type Platform string

const (
	PlatformGitHub Platform = "github"
	PlatformGitLab Platform = "gitlab"
	PlatformJira   Platform = "jira"
	PlatformLinear Platform = "linear"
)

// Event is the normalized, platform-agnostic representation of a webhook event.
type Event struct {
	ID        string
	Type      EventType
	Platform  Platform
	Timestamp time.Time

	// Repository context
	RepoOwner string
	RepoName  string

	// PR context (pr_opened, pr_synchronized, pr_merged, pr_closed, review_submitted, ci_completed)
	PRNumber      int
	PRTitle       string
	PRState       string // "open", "merged", "closed"
	PRBranch      string
	PRURL         string
	PRCreatedAt   string // from pull_request.created_at
	PRAuthor      string // from pull_request.user.login
	PRCommitCount int    // from pull_request.commits (total count)
	MergedAt      string
	ClosedAt      string

	// Review context (review_submitted)
	ReviewState  string // "approved", "changes_requested", "commented"
	ReviewAuthor string

	// CI context (ci_completed)
	CheckName       string
	CheckConclusion string // "success", "failure", etc.

	// Issue context (issue_updated)
	IssueKey    string
	IssueStatus string

	// Raw payload for debugging
	RawPayload []byte
}
