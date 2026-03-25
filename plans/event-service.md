# Plan: Platform-Agnostic Event Service

## Context

AX currently detects PR state changes via polling (`ax watch`), which calls `gh pr list` every 5 minutes, iterates through PRs, and calls `MaybeFinalizePR` / `FinalizePR` for those that reached terminal states. This works but has three problems:

1. **Latency**: Up to 5 minutes between a PR merge and metric finalization.
2. **API cost**: Polling lists all PRs every cycle, even when nothing changed. GitHub rate limits become a real concern for teams with many repos.
3. **Platform lock-in**: The entire data pipeline assumes GitHub. GitLab, Jira, and Linear integration is impossible without a normalized abstraction.

The event service introduces webhook receivers that accept platform-specific payloads, validate them, normalize them into a common event model, and dispatch them to the same finalization logic. Polling remains as a fallback.

---

## Architecture Overview

```
                     GitHub Webhook
                     GitLab Webhook        ┌──────────────────┐
                     Jira Webhook    ───►  │  Webhook Receiver │
                     Linear Webhook        │  /webhooks/{plat} │
                                           └────────┬─────────┘
                                                    │
                                           ┌────────▼─────────┐
                                           │  Platform Adapter │
                                           │  (validate +      │
                                           │   normalize)       │
                                           └────────┬─────────┘
                                                    │
                                           ┌────────▼─────────┐
                                           │  Event Dispatcher │
                                           │  (route to        │
                                           │   handlers)        │
                                           └────────┬─────────┘
                                                    │
                           ┌────────────────────────┼────────────────────┐
                           │                        │                    │
                    ┌──────▼──────┐   ┌─────────────▼──────┐   ┌────────▼───────┐
                    │ PR Handler  │   │ Review Handler     │   │ CI Handler     │
                    │ (finalize)  │   │ (first-pass rate)  │   │ (CI success)   │
                    └─────────────┘   └────────────────────┘   └────────────────┘
```

New packages:
- `internal/events/` -- normalized event model, dispatcher, handler registry
- `internal/events/adapters/` -- per-platform adapter implementations
- `internal/events/webhook/` -- HTTP handler for incoming webhooks

The webhook receiver will be mounted on the existing `ax server` command (or a new `ax serve` HTTP server if `ax server` does not exist yet -- based on exploration, no HTTP server currently exists in the binary, so this will need to be added as a new command or integrated alongside the dashboard).

---

## Normalized Event Model

File: `internal/events/event.go`

```go
package events

import "time"

// EventType identifies the kind of normalized event.
type EventType string

const (
    EventPRMerged         EventType = "pr_merged"
    EventPRClosed         EventType = "pr_closed"
    EventReviewSubmitted  EventType = "review_submitted"
    EventCICompleted      EventType = "ci_completed"
    EventIssueUpdated     EventType = "issue_updated"
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
    ID        string    // unique event ID (from platform or generated)
    Type      EventType
    Platform  Platform
    Timestamp time.Time

    // Repository context (at least one of these populated)
    RepoOwner string // e.g., "austinroos"
    RepoName  string // e.g., "ax"

    // PR context (populated for pr_merged, pr_closed, review_submitted, ci_completed)
    PRNumber  int
    PRTitle   string
    PRState   string // "merged", "closed"
    PRBranch  string
    PRURL     string
    MergedAt  string
    ClosedAt  string

    // Review context (populated for review_submitted)
    ReviewState  string // "approved", "changes_requested", "commented"
    ReviewAuthor string

    // CI context (populated for ci_completed)
    CheckName       string
    CheckConclusion string // "success", "failure", etc.

    // Issue context (populated for issue_updated)
    IssueKey    string // Jira key or Linear ID
    IssueStatus string

    // Raw payload for debugging / future use
    RawPayload []byte
}
```

---

## Platform Adapter Interface

File: `internal/events/adapter.go`

```go
package events

import "net/http"

// Adapter translates platform-specific webhook payloads into normalized events.
// Each platform (GitHub, GitLab, Jira, Linear) implements this interface.
type Adapter interface {
    // Platform returns the platform identifier.
    Platform() Platform

    // ValidateRequest verifies the webhook signature / authentication.
    // Returns an error if validation fails.
    ValidateRequest(r *http.Request, secret string) error

    // ParseEvents extracts normalized events from a webhook payload.
    // A single webhook may produce zero or more events (e.g., a GitHub
    // pull_request event with action "opened" produces nothing, while
    // action "closed" with merged=true produces EventPRMerged).
    ParseEvents(r *http.Request) ([]Event, error)

    // EventTypes returns the set of event types this adapter can produce.
    EventTypes() []EventType
}
```

---

## GitHub Adapter (Primary Implementation)

File: `internal/events/adapters/github.go`

This is the most detailed adapter since GitHub is the first platform AX supports.

**Webhook events to handle:**

| GitHub Event | Action/Condition | Normalized Event |
|---|---|---|
| `pull_request` | `action=closed`, `merged=true` | `pr_merged` |
| `pull_request` | `action=closed`, `merged=false` | `pr_closed` |
| `pull_request_review` | any | `review_submitted` |
| `check_suite` | `action=completed` | `ci_completed` |

**Signature validation:**
- Read `X-Hub-Signature-256` header
- Compute HMAC-SHA256 of the raw request body using the configured webhook secret
- Compare using `hmac.Equal()` (constant-time)

**Key implementation details:**

```go
package adapters

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "strings"
    "time"

    "github.com/austinroos/ax/internal/events"
)

type GitHubAdapter struct{}

func (g *GitHubAdapter) Platform() events.Platform {
    return events.PlatformGitHub
}

func (g *GitHubAdapter) ValidateRequest(r *http.Request, secret string) error {
    if secret == "" {
        return nil // no secret configured, skip validation
    }
    sig := r.Header.Get("X-Hub-Signature-256")
    if sig == "" {
        return fmt.Errorf("missing X-Hub-Signature-256 header")
    }
    // Read body, compute HMAC, compare
    // (body must be buffered for both validation and parsing)
    ...
}

func (g *GitHubAdapter) ParseEvents(r *http.Request) ([]events.Event, error) {
    eventType := r.Header.Get("X-GitHub-Event")
    body, _ := io.ReadAll(r.Body)

    switch eventType {
    case "pull_request":
        return g.parsePullRequest(body)
    case "pull_request_review":
        return g.parseReview(body)
    case "check_suite":
        return g.parseCheckSuite(body)
    default:
        return nil, nil // ignore unhandled events
    }
}
```

**GitHub webhook payload structs** (minimal, only fields we need):

```go
type ghWebhookPR struct {
    Action      string `json:"action"`
    Number      int    `json:"number"`
    PullRequest struct {
        Number      int    `json:"number"`
        Title       string `json:"title"`
        State       string `json:"state"`
        Merged      bool   `json:"merged"`
        HTMLURL     string `json:"html_url"`
        MergedAt    string `json:"merged_at"`
        ClosedAt    string `json:"closed_at"`
        Head        struct {
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
```

---

## GitLab Adapter Outline

File: `internal/events/adapters/gitlab.go`

**Webhook events:**

| GitLab Event | Condition | Normalized Event |
|---|---|---|
| Merge Request Hook | `action=merge` | `pr_merged` |
| Merge Request Hook | `action=close` | `pr_closed` |
| Note Hook (on MR) | type=MergeRequest | `review_submitted` |
| Pipeline Hook | status=success/failed | `ci_completed` |

**Signature validation:**
- GitLab uses `X-Gitlab-Token` header -- simple string comparison with configured secret token.

**Key difference from GitHub:** GitLab calls PRs "Merge Requests" and uses different payload structures. The `iid` field (internal ID) maps to PR number. The repo is identified by `project.path_with_namespace`.

---

## Jira Adapter Outline

File: `internal/events/adapters/jira.go`

**Webhook events:**

| Jira Event | Condition | Normalized Event |
|---|---|---|
| `jira:issue_updated` | status change | `issue_updated` |

**Signature validation:**
- Jira Cloud uses JWT-based authentication in the `Authorization` header.
- Jira Server/DC uses webhook secrets via `X-Hub-Signature` (similar to GitHub).

**Notes:** Jira events do not map to PR/CI events. They populate the `IssueKey` and `IssueStatus` fields on the normalized event. Future use for correlating issue status to PR workflows.

---

## Linear Adapter Outline

File: `internal/events/adapters/linear.go`

**Webhook events:**

| Linear Event | Condition | Normalized Event |
|---|---|---|
| `Issue` | state change | `issue_updated` |

**Signature validation:**
- Linear signs payloads with HMAC-SHA256 using the webhook signing secret.
- Verify via `Linear-Signature` header.

**Notes:** Similar to Jira -- Linear events produce `issue_updated` only. Linear issues are identified by their unique identifier (e.g., `AX-123`).

---

## Webhook Receiver

File: `internal/events/webhook/handler.go`

The receiver is a standard `net/http` handler that:

1. Routes requests by platform: `POST /webhooks/github`, `POST /webhooks/gitlab`, etc.
2. Looks up the adapter for the platform.
3. Validates the request signature.
4. Parses normalized events.
5. Dispatches each event to registered handlers.

```go
package webhook

import (
    "log"
    "net/http"

    "github.com/austinroos/ax/internal/events"
    "github.com/jmoiron/sqlx"
)

type Receiver struct {
    adapters map[events.Platform]events.Adapter
    secrets  map[events.Platform]string
    handlers []events.Handler
    db       *sqlx.DB
}

func NewReceiver(db *sqlx.DB, config Config) *Receiver { ... }

func (recv *Receiver) RegisterAdapter(a events.Adapter, secret string) { ... }
func (recv *Receiver) RegisterHandler(h events.Handler) { ... }

// ServeHTTP handles incoming webhook requests.
// Route: POST /webhooks/{platform}
func (recv *Receiver) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // 1. Extract platform from URL path
    // 2. Look up adapter
    // 3. Validate signature
    // 4. Parse events
    // 5. For each event, dispatch to all handlers
    // 6. Return 200 OK (or 202 Accepted)
}

func (recv *Receiver) Mount(mux *http.ServeMux) {
    mux.Handle("POST /webhooks/github", recv)
    mux.Handle("POST /webhooks/gitlab", recv)
    mux.Handle("POST /webhooks/jira", recv)
    mux.Handle("POST /webhooks/linear", recv)
}
```

---

## Event Handler Interface and Dispatcher

File: `internal/events/handler.go`

```go
package events

// Handler processes a normalized event.
type Handler interface {
    // HandleEvent is called for each normalized event.
    HandleEvent(evt Event) error

    // AcceptsType returns true if this handler should receive the given event type.
    AcceptsType(t EventType) bool
}
```

File: `internal/events/dispatcher.go`

```go
package events

import "log"

// Dispatcher routes events to registered handlers.
type Dispatcher struct {
    handlers []Handler
}

func NewDispatcher() *Dispatcher { ... }

func (d *Dispatcher) Register(h Handler) { ... }

func (d *Dispatcher) Dispatch(evt Event) {
    for _, h := range d.handlers {
        if h.AcceptsType(evt.Type) {
            if err := h.HandleEvent(evt); err != nil {
                log.Printf("event handler error (%s): %v", evt.Type, err)
            }
        }
    }
}
```

---

## Integration with Existing Finalization Logic

File: `internal/events/handlers/pr_handler.go`

This is the critical integration point. The PR handler receives `pr_merged` and `pr_closed` events and calls the same `FinalizePR` logic that `ax watch` currently uses.

```go
package handlers

import (
    "database/sql"
    "log"

    "github.com/austinroos/ax/internal/db"
    "github.com/austinroos/ax/internal/events"
    "github.com/austinroos/ax/internal/metrics"
    "github.com/austinroos/ax/internal/parsers"
    axsync "github.com/austinroos/ax/internal/sync"
    "github.com/jmoiron/sqlx"
)

type PRHandler struct {
    db *sqlx.DB
}

func (h *PRHandler) AcceptsType(t events.EventType) bool {
    return t == events.EventPRMerged || t == events.EventPRClosed
}

func (h *PRHandler) HandleEvent(evt events.Event) error {
    // 1. Look up repo by owner/name
    repo, err := db.GetRepoByOwnerAndName(h.db, evt.RepoOwner, evt.RepoName)
    //    ^^^ NEW QUERY NEEDED - currently only GetRepoByPath exists

    // 2. Upsert PR with new state
    state := "closed"
    if evt.Type == events.EventPRMerged {
        state = "merged"
    }
    pr := &db.PR{
        RepoID:   repo.ID,
        Number:   evt.PRNumber,
        Title:    sql.NullString{String: evt.PRTitle, Valid: evt.PRTitle != ""},
        Branch:   sql.NullString{String: evt.PRBranch, Valid: evt.PRBranch != ""},
        State:    sql.NullString{String: state, Valid: true},
        MergedAt: sql.NullString{String: evt.MergedAt, Valid: evt.MergedAt != ""},
        ClosedAt: sql.NullString{String: evt.ClosedAt, Valid: evt.ClosedAt != ""},
        URL:      sql.NullString{String: evt.PRURL, Valid: evt.PRURL != ""},
    }
    prID, _ := db.UpsertPR(h.db, pr)

    // 3. Fetch additional data needed for metrics (reviews, checks, commits)
    //    Use GitHubParser (or equivalent) to get review/check data
    //    This is the same logic as pollRepo() in watch.go lines 170-198

    // 4. Call FinalizePR -- same as watch.go
    axsync.FinalizePR(h.db, prID, existing)

    return nil
}
```

**Critical integration note:** The `pollRepo()` function in `internal/sync/watch.go` (lines 110-213) contains inline metric computation (fetching reviews, checks, commits via `ghParser`) before calling `FinalizePR`. This logic needs to be extracted into a shared function that both the polling path and the event handler can call. The refactored function signature would be something like:

```go
// FinalizeWithGitHubData fetches review/CI/commit data from GitHub and finalizes the PR.
func FinalizeWithGitHubData(database *sqlx.DB, repoID int64, owner, repoName string, prID int64, prNumber int, state string) error
```

This function would be called by both `pollRepo()` and the PR event handler.

---

## Review Handler

File: `internal/events/handlers/review_handler.go`

Receives `review_submitted` events. Updates the `first_pass_accepted` metric for the PR without finalizing. This allows real-time metric updates for in-flight PRs.

---

## CI Handler

File: `internal/events/handlers/ci_handler.go`

Receives `ci_completed` events. Updates the `ci_success_rate` metric for the PR without finalizing.

---

## Configuration Model

File: `internal/events/config.go`

```go
package events

// Config holds webhook configuration for all platforms.
type Config struct {
    Enabled   bool              `json:"enabled"`
    Platforms map[Platform]PlatformConfig `json:"platforms"`
}

// PlatformConfig holds configuration for a single platform.
type PlatformConfig struct {
    Enabled       bool   `json:"enabled"`
    WebhookSecret string `json:"webhook_secret"` // for signature validation
}
```

Configuration is loaded from `~/.ax/config.json` or environment variables:
- `AX_WEBHOOK_GITHUB_SECRET` -- GitHub webhook secret
- `AX_WEBHOOK_GITLAB_SECRET` -- GitLab webhook token
- `AX_WEBHOOK_JIRA_SECRET` -- Jira webhook secret
- `AX_WEBHOOK_LINEAR_SECRET` -- Linear signing secret

---

## Database Changes

Migration 4 in `internal/db/db.go`:

```sql
-- Event log for audit trail and debugging
CREATE TABLE webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE,
    platform TEXT NOT NULL,
    event_type TEXT NOT NULL,
    repo_owner TEXT,
    repo_name TEXT,
    pr_number INTEGER,
    processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    success INTEGER DEFAULT 1,
    error_message TEXT
);

CREATE INDEX idx_webhook_events_repo ON webhook_events(repo_owner, repo_name);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
```

New query in `internal/db/queries.go`:

```go
// GetRepoByOwnerAndName returns a repo by GitHub owner and repo name.
func GetRepoByOwnerAndName(db *sqlx.DB, owner, name string) (*Repo, error) {
    var repo Repo
    err := db.Get(&repo, "SELECT * FROM repos WHERE github_owner = ? AND github_repo = ?", owner, name)
    ...
}
```

---

## CLI Integration

A new `ax serve` command (or extension to the existing `ax dashboard` command) will start an HTTP server that mounts both the dashboard and the webhook receiver:

```
ax serve --port 8080
  -> /webhooks/github   (webhook receiver)
  -> /webhooks/gitlab   (webhook receiver)
  -> /                  (dashboard, if built)
```

Alternatively, the webhook routes could be added to the existing `ax dashboard` command since it already runs an HTTP process. However, separating them is cleaner since the dashboard is a Next.js dev server today.

---

## Implementation Phases

### Phase A: Core event model and GitHub adapter (primary deliverable)

1. Create `internal/events/event.go` -- Event struct, EventType, Platform constants
2. Create `internal/events/adapter.go` -- Adapter interface
3. Create `internal/events/handler.go` -- Handler interface
4. Create `internal/events/dispatcher.go` -- Dispatcher
5. Create `internal/events/adapters/github.go` -- GitHub adapter with HMAC validation and payload parsing
6. Create `internal/events/adapters/github_test.go` -- Tests with real GitHub webhook payloads
7. Refactor `internal/sync/watch.go` -- Extract `FinalizeWithGitHubData()` from `pollRepo()` so both polling and events can share finalization logic
8. Create `internal/events/handlers/pr_handler.go` -- PR merge/close handler calling shared finalization
9. Add `GetRepoByOwnerAndName()` to `internal/db/queries.go`
10. Add migration 4 (webhook_events table) to `internal/db/db.go`

### Phase B: Webhook receiver and CLI

1. Create `internal/events/webhook/handler.go` -- HTTP handler, routing, adapter dispatch
2. Create `internal/events/config.go` -- Configuration model, env var loading
3. Add `ax serve` command to `cmd/ax/main.go` -- starts HTTP server with webhook routes
4. Create `internal/events/webhook/handler_test.go` -- Integration tests

### Phase C: Review and CI handlers

1. Create `internal/events/handlers/review_handler.go` -- update first_pass_accepted on review events
2. Create `internal/events/handlers/ci_handler.go` -- update ci_success_rate on check suite events
3. Tests for both

### Phase D: Additional platform adapters

1. `internal/events/adapters/gitlab.go` -- GitLab adapter
2. `internal/events/adapters/jira.go` -- Jira adapter
3. `internal/events/adapters/linear.go` -- Linear adapter
4. Tests for each

### Phase E: Documentation and ADR

1. ADR `docs/decisions/010-event-service.md` documenting the architecture decision
2. Setup guide for configuring webhooks per platform
3. Update README with webhook configuration

---

## Key Design Decisions

1. **No new dependencies**: Webhook signature validation uses `crypto/hmac` and `crypto/sha256` from the standard library. HTTP routing uses `net/http` standard mux (Go 1.22+ method routing: `mux.Handle("POST /webhooks/github", ...)`). This is consistent with the existing project convention of minimal dependencies.

2. **Shared finalization path**: The PR handler calls the same `FinalizePR` logic as polling. This requires a refactor to extract the metric-fetching logic from `pollRepo()` into a shared function. The existing `MaybeFinalizePR` function is too thin -- it skips metric computation (reviews, CI, commits). The fuller logic in `pollRepo()` lines 170-198 needs to be reusable.

3. **Event log table**: Webhook events are logged to `webhook_events` for debugging and deduplication. The `event_id` column (UNIQUE) prevents processing the same event twice if a platform retries delivery.

4. **Polling remains**: The `ax watch` command continues to work unchanged. Teams can use webhooks, polling, or both. If a PR is already finalized (checked via `IsPRFinalized`), duplicate processing is a no-op.

5. **Adapters own validation and parsing**: Each adapter is responsible for both signature validation and payload normalization. The webhook receiver does not need to know anything about platform-specific formats.

---

## Potential Challenges

1. **Body buffering for validation**: HMAC validation requires reading the full request body, but so does JSON parsing. The webhook handler must buffer the body (read once, use for both validation and parsing). This means `r.Body` should be read into `[]byte` and replaced with an `io.NopCloser(bytes.NewReader(body))` before calling `ParseEvents`.

2. **Repo lookup**: Events arrive with owner/repo names but the database is keyed on filesystem path. The new `GetRepoByOwnerAndName` query bridges this, but it requires that repos have been synced at least once (so `github_owner` and `github_repo` are populated). This is acceptable since metrics only make sense for repos that have been synced.

3. **Metric computation in event handlers**: When a PR is merged via webhook, the handler still needs to fetch reviews, CI checks, and commits from GitHub to compute Phase 1 metrics. This means the event handler makes GitHub API calls -- it does not just use data from the webhook payload. This is intentional: webhook payloads contain the event trigger but not the full context needed for metrics.

4. **No `ax server` exists yet**: The codebase currently has no HTTP server. The `ax dashboard` command spawns a Next.js dev server via `exec.Command`. A new `ax serve` command is needed, or the webhook handler could be integrated into a future embedded dashboard (per ADR 007).

---

### Critical Files for Implementation

- `/Users/austinroos/dev/ax/internal/sync/watch.go` - Contains `pollRepo()` with inline finalization logic that must be extracted into a shared function for both polling and event-driven paths
- `/Users/austinroos/dev/ax/internal/sync/finalize.go` - Core `FinalizePR()`, `MaybeFinalizePR()`, `IsTerminalState()` functions that event handlers will call
- `/Users/austinroos/dev/ax/internal/db/queries.go` - Needs new `GetRepoByOwnerAndName()` query; contains all DB operations the handlers will use
- `/Users/austinroos/dev/ax/internal/db/db.go` - Migration 4 for the `webhook_events` table must be appended to the `migrations` slice
- `/Users/austinroos/dev/ax/cmd/ax/main.go` - New `ax serve` command registration; pattern reference for how commands are structured with cobra
