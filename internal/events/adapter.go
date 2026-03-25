package events

import "net/http"

// Adapter translates platform-specific webhook payloads into normalized events.
type Adapter interface {
	// Platform returns the platform identifier.
	Platform() Platform

	// ValidateRequest verifies the webhook signature.
	// body is the raw request body (already read for reuse).
	ValidateRequest(r *http.Request, body []byte, secret string) error

	// ParseEvents extracts normalized events from a webhook payload.
	// A single webhook may produce zero or more events.
	ParseEvents(r *http.Request, body []byte) ([]Event, error)
}
