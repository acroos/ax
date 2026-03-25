// Package push handles sending local AX data to a team server.
package push

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/austinroos/ax/internal/api"
)

var version = "dev"

// Client sends data to an AX team server.
type Client struct {
	ServerURL  string
	APIKey     string
	HTTPClient *http.Client
}

// NewClient creates a push client for the given server.
func NewClient(serverURL, apiKey string) *Client {
	return &Client{
		ServerURL: serverURL,
		APIKey:    apiKey,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Push sends a payload to the server's push endpoint.
func (c *Client) Push(payload *api.PushPayload) (*api.PushResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

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

	// Now check auth by hitting an authenticated endpoint
	resp, err = c.doRequest("GET", "/api/v1/repos", nil)
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
