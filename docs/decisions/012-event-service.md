# ADR-012: Platform-Agnostic Event Service

## Status
Accepted (GitHub adapter implemented; GitLab, Jira, Linear adapters planned)

## Date
2026-03-25

## Context
AX initially relied on polling (`ax watch`) to detect GitHub PR state changes, introducing up to 5 minutes of latency and consuming GitHub API rate limits. Teams with many repos or multiple platforms (GitLab, Jira, Linear) need a normalized event system that works across platforms and provides real-time updates.

## Decision

### Normalized event model
All platform-specific webhooks are translated into a common set of event types:
- `pr_merged` — triggers metric finalization
- `pr_closed` — triggers finalization (marks as abandoned)
- `review_submitted` — updates first-pass acceptance
- `ci_completed` — updates CI success rate
- `issue_updated` — Jira/Linear status changes (future)

### Platform adapter interface
Each platform implements an `Adapter` interface with two methods:
- `ValidateRequest(r, body, secret)` — verifies webhook signatures
- `ParseEvents(r, body)` — translates platform-specific payloads to normalized events

### Webhook receiver
HTTP handler at `POST /webhooks/{platform}` mounted on `ax server`. Reads the body once for both signature validation and parsing. Dispatches events to registered handlers.

### GitHub adapter (implemented)
- HMAC-SHA256 signature validation via `X-Hub-Signature-256` header
- Handles `pull_request` (closed), `pull_request_review` (submitted), `check_suite` (completed)
- Configured via `AX_WEBHOOK_GITHUB_SECRET` environment variable

### Polling remains as fallback
`ax watch` continues to work alongside webhooks. If a PR is already finalized via webhook, polling skips it (`IsPRFinalized` check).

## Alternatives Considered
- **GitHub Actions relay**: Runs in CI, can't write to the team database directly.
- **Dedicated webhook-only service**: Separate binary adds deployment complexity.
- **Replace polling entirely**: Webhooks can fail silently; keeping polling as fallback ensures no PRs are missed.

## Consequences
**Easier:**
- Real-time metric finalization (seconds vs 5-minute polling delay)
- Extensible to GitLab, Jira, Linear with new adapters
- Reduced GitHub API consumption

**Harder:**
- Teams must configure webhooks on their GitHub repos
- Webhook secrets must be managed (env vars per platform)
- GitLab/Jira/Linear adapters not yet implemented

## Key Files
- `internal/events/event.go` — Normalized event types
- `internal/events/adapter.go` — Adapter interface
- `internal/events/dispatcher.go` — Event routing to handlers
- `internal/events/receiver.go` — HTTP webhook handler
- `internal/events/handlers.go` — PR finalization handler
- `internal/events/adapters/github.go` — GitHub adapter
