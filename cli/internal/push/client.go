// Package push handles sending local AX data to a team server.
package push

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/austinroos/ax/internal/api"
)

var version = "dev"

// maxRateLimitRetries is the maximum number of times to retry after a 429.
const maxRateLimitRetries = 3

// defaultRetryAfter is used when the server doesn't send a Retry-After header.
const defaultRetryAfter = 10 * time.Second

// Client sends data to an AX team server.
type Client struct {
	ServerURL  string
	APIKey     string
	HTTPClient *http.Client

	// OnRateLimit, if set, is called before each rate-limit sleep with the
	// wait duration. Callers can use this to surface wait times in their UI.
	OnRateLimit func(d time.Duration)

	// SleepFunc is the function used for sleeping. Defaults to time.Sleep.
	// Tests can override this to avoid real delays.
	SleepFunc func(time.Duration)
}

// NewClient creates a push client for the given server.
func NewClient(serverURL, apiKey string) *Client {
	return &Client{
		ServerURL: serverURL,
		APIKey:    apiKey,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		SleepFunc: time.Sleep,
	}
}

// WithOnRateLimit returns a shallow copy of the client with the given callback.
// The copy shares the same HTTPClient, so it's safe for concurrent use.
func (c *Client) WithOnRateLimit(fn func(d time.Duration)) *Client {
	clone := *c
	clone.OnRateLimit = fn
	return &clone
}

// Push sends a payload to the server's push endpoint.
func (c *Client) Push(payload *api.PushPayload) (*api.PushResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	rateLimitRetries := 0

	for {
		pushResp, err := c.pushOnce(body)
		if err == nil {
			return pushResp, nil
		}

		// If it's a rate limit error, retry with backoff.
		if rlErr, ok := err.(*RateLimitError); ok {
			rateLimitRetries++
			if rateLimitRetries > maxRateLimitRetries {
				return nil, fmt.Errorf("rate limited %d times, giving up: %w", maxRateLimitRetries, rlErr)
			}
			if c.OnRateLimit != nil {
				c.OnRateLimit(rlErr.RetryAfter)
			}
			c.SleepFunc(rlErr.RetryAfter)
			continue
		}

		return nil, err
	}
}

// pushOnce attempts a single push with one 5xx retry. Returns a *RateLimitError
// on 429 so the caller can decide whether to back off and retry.
func (c *Client) pushOnce(body []byte) (*api.PushResponse, error) {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		resp, err := c.doRequest("POST", "/api/v1/push", body)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)

		if resp.StatusCode == http.StatusOK {
			var pushResp api.PushResponse
			if err := json.Unmarshal(respBody, &pushResp); err != nil {
				return nil, fmt.Errorf("failed to parse response: %w", err)
			}
			return &pushResp, nil
		}

		// Rate limited — parse Retry-After and bubble up.
		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"))
			return nil, &RateLimitError{RetryAfter: retryAfter}
		}

		// Retry on 5xx
		if resp.StatusCode >= 500 && attempt == 0 {
			lastErr = fmt.Errorf("server error: %d %s", resp.StatusCode, string(respBody))
			time.Sleep(1 * time.Second)
			continue
		}

		return nil, fmt.Errorf("push failed: %d %s", resp.StatusCode, string(respBody))
	}

	return nil, fmt.Errorf("push failed after retry: %w", lastErr)
}

// RateLimitError is returned when the server responds with 429.
type RateLimitError struct {
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("rate limited (retry after %s)", e.RetryAfter.Round(time.Second))
}

// parseRetryAfter parses the Retry-After header value (seconds) into a Duration.
func parseRetryAfter(header string) time.Duration {
	if header == "" {
		return defaultRetryAfter
	}
	secs, err := strconv.Atoi(header)
	if err != nil || secs <= 0 {
		return defaultRetryAfter
	}
	return time.Duration(secs) * time.Second
}

// Ping checks if the server is reachable and the API key is valid.
// Returns nil if the server is healthy and the key authenticates.
func (c *Client) Ping() error {
	// First check health (no auth required)
	resp, err := c.doRequest("GET", "/api/v1/health", nil)
	if err != nil {
		return fmt.Errorf("cannot reach server at %s: %w", c.ServerURL, err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server health check failed (status %d)", resp.StatusCode)
	}

	// Now check auth by hitting the ping endpoint (API key auth)
	resp, err = c.doRequest("GET", "/api/v1/ping", nil)
	if err != nil {
		return fmt.Errorf("auth check failed: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("API key is invalid — check with your team admin")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("auth check returned unexpected status %d", resp.StatusCode)
	}

	return nil
}

// HealthCheck checks if the server is reachable (no auth required).
func (c *Client) HealthCheck() error {
	resp, err := c.doRequest("GET", "/api/v1/health", nil)
	if err != nil {
		return fmt.Errorf("cannot reach server at %s: %w", c.ServerURL, err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server returned status %d", resp.StatusCode)
	}
	return nil
}

func (c *Client) doRequest(method, path string, body []byte) (*http.Response, error) {
	url := c.ServerURL + path

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("User-Agent", "ax/"+version)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return c.HTTPClient.Do(req)
}
