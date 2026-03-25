// Package adapters provides platform-specific webhook adapters.
package adapters

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/austinroos/ax/internal/events"
)

// GitHubAdapter translates GitHub webhook payloads into normalized events.
type GitHubAdapter struct{}

func (g *GitHubAdapter) Platform() events.Platform {
	return events.PlatformGitHub
}

func (g *GitHubAdapter) ValidateRequest(r *http.Request, body []byte, secret string) error {
	sig := r.Header.Get("X-Hub-Signature-256")
	if sig == "" {
		return fmt.Errorf("missing X-Hub-Signature-256 header")
	}

	sig = strings.TrimPrefix(sig, "sha256=")

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return fmt.Errorf("signature mismatch")
	}

	return nil
}

func (g *GitHubAdapter) ParseEvents(r *http.Request, body []byte) ([]events.Event, error) {
	eventType := r.Header.Get("X-GitHub-Event")

	switch eventType {
	case "pull_request":
		return g.parsePullRequest(body)
	case "pull_request_review":
		return g.parseReview(body)
	case "check_suite":
		return g.parseCheckSuite(body)
	default:
		return nil, nil // ignore unhandled event types
	}
}

// --- GitHub webhook payload types ---

type ghPRWebhook struct {
	Action      string `json:"action"`
	PullRequest struct {
		Number   int    `json:"number"`
		Title    string `json:"title"`
		State    string `json:"state"`
		Merged   bool   `json:"merged"`
		HTMLURL  string `json:"html_url"`
		MergedAt string `json:"merged_at"`
		ClosedAt string `json:"closed_at"`
		Head     struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Repo struct {
				Owner struct {
					Login string `json:"login"`
				} `json:"owner"`
				Name string `json:"name"`
			} `json:"repo"`
		} `json:"base"`
	} `json:"pull_request"`
}

type ghReviewWebhook struct {
	Action      string `json:"action"`
	Review      struct {
		State string `json:"state"`
		User  struct {
			Login string `json:"login"`
		} `json:"user"`
	} `json:"review"`
	PullRequest struct {
		Number int `json:"number"`
		Base   struct {
			Repo struct {
				Owner struct {
					Login string `json:"login"`
				} `json:"owner"`
				Name string `json:"name"`
			} `json:"repo"`
		} `json:"base"`
	} `json:"pull_request"`
}

type ghCheckSuiteWebhook struct {
	Action     string `json:"action"`
	CheckSuite struct {
		Conclusion  string `json:"conclusion"`
		PullRequests []struct {
			Number int `json:"number"`
		} `json:"pull_requests"`
	} `json:"check_suite"`
	Repository struct {
		Owner struct {
			Login string `json:"login"`
		} `json:"owner"`
		Name string `json:"name"`
	} `json:"repository"`
}

// --- Parsers ---

func (g *GitHubAdapter) parsePullRequest(body []byte) ([]events.Event, error) {
	var payload ghPRWebhook
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse pull_request webhook: %w", err)
	}

	// Only handle "closed" action
	if payload.Action != "closed" {
		return nil, nil
	}

	pr := payload.PullRequest
	evt := events.Event{
		ID:        fmt.Sprintf("gh-pr-%s-%s-%d-%s", pr.Base.Repo.Owner.Login, pr.Base.Repo.Name, pr.Number, payload.Action),
		Platform:  events.PlatformGitHub,
		Timestamp: time.Now(),
		RepoOwner: pr.Base.Repo.Owner.Login,
		RepoName:  pr.Base.Repo.Name,
		PRNumber:  pr.Number,
		PRTitle:   pr.Title,
		PRBranch:  pr.Head.Ref,
		PRURL:     pr.HTMLURL,
		MergedAt:  pr.MergedAt,
		ClosedAt:  pr.ClosedAt,
	}

	if pr.Merged {
		evt.Type = events.EventPRMerged
		evt.PRState = "merged"
	} else {
		evt.Type = events.EventPRClosed
		evt.PRState = "closed"
	}

	return []events.Event{evt}, nil
}

func (g *GitHubAdapter) parseReview(body []byte) ([]events.Event, error) {
	var payload ghReviewWebhook
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse pull_request_review webhook: %w", err)
	}

	if payload.Action != "submitted" {
		return nil, nil
	}

	evt := events.Event{
		ID:           fmt.Sprintf("gh-review-%s-%s-%d-%s", payload.PullRequest.Base.Repo.Owner.Login, payload.PullRequest.Base.Repo.Name, payload.PullRequest.Number, payload.Review.User.Login),
		Type:         events.EventReviewSubmitted,
		Platform:     events.PlatformGitHub,
		Timestamp:    time.Now(),
		RepoOwner:    payload.PullRequest.Base.Repo.Owner.Login,
		RepoName:     payload.PullRequest.Base.Repo.Name,
		PRNumber:     payload.PullRequest.Number,
		ReviewState:  strings.ToUpper(payload.Review.State),
		ReviewAuthor: payload.Review.User.Login,
	}

	return []events.Event{evt}, nil
}

func (g *GitHubAdapter) parseCheckSuite(body []byte) ([]events.Event, error) {
	var payload ghCheckSuiteWebhook
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse check_suite webhook: %w", err)
	}

	if payload.Action != "completed" {
		return nil, nil
	}

	var evts []events.Event
	for _, pr := range payload.CheckSuite.PullRequests {
		evt := events.Event{
			ID:              fmt.Sprintf("gh-checks-%s-%s-%d", payload.Repository.Owner.Login, payload.Repository.Name, pr.Number),
			Type:            events.EventCICompleted,
			Platform:        events.PlatformGitHub,
			Timestamp:       time.Now(),
			RepoOwner:       payload.Repository.Owner.Login,
			RepoName:        payload.Repository.Name,
			PRNumber:        pr.Number,
			CheckConclusion: payload.CheckSuite.Conclusion,
		}
		evts = append(evts, evt)
	}

	return evts, nil
}
