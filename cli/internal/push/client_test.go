package push

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/austinroos/ax/internal/api"
)

func TestPush_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := api.PushResponse{OK: true, Entities: map[string]int{"sessions": 1}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	payload := &api.PushPayload{Owner: "o", Repo: "r", Sessions: []api.SessionData{{ID: "s1"}}}

	resp, err := client.Push(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.OK {
		t.Error("expected OK response")
	}
}

func TestPush_RateLimitRetrySucceeds(t *testing.T) {
	var requestCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := requestCount.Add(1)
		if n <= 2 {
			// First two attempts return 429.
			w.Header().Set("Retry-After", "5")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]any{"error": "rate limited", "retry_after": 5})
			return
		}
		resp := api.PushResponse{OK: true, Entities: map[string]int{"sessions": 1}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	client.SleepFunc = func(d time.Duration) {} // no-op sleep for tests
	payload := &api.PushPayload{Owner: "o", Repo: "r", Sessions: []api.SessionData{{ID: "s1"}}}

	resp, err := client.Push(payload)
	if err != nil {
		t.Fatalf("expected success after retries, got: %v", err)
	}
	if !resp.OK {
		t.Error("expected OK response")
	}
	// 2 rate-limited + 1 success = 3 requests
	if requestCount.Load() != 3 {
		t.Errorf("expected 3 requests, got %d", requestCount.Load())
	}
}

func TestPush_RateLimitExhaustsRetries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]any{"error": "rate limited", "retry_after": 30})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	client.SleepFunc = func(d time.Duration) {} // no-op sleep for tests
	payload := &api.PushPayload{Owner: "o", Repo: "r", Sessions: []api.SessionData{{ID: "s1"}}}

	_, err := client.Push(payload)
	if err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	if got := err.Error(); got == "" {
		t.Error("expected non-empty error message")
	}
}

func TestPush_RateLimitCallsOnRateLimit(t *testing.T) {
	var requestCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := requestCount.Add(1)
		if n == 1 {
			w.Header().Set("Retry-After", "15")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]any{"error": "rate limited", "retry_after": 15})
			return
		}
		resp := api.PushResponse{OK: true, Entities: map[string]int{"sessions": 1}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	var callbackDuration time.Duration
	var callbackCount int

	client := NewClient(server.URL, "test-key")
	client.SleepFunc = func(d time.Duration) {} // no-op sleep for tests
	client.OnRateLimit = func(d time.Duration) {
		callbackCount++
		callbackDuration = d
	}

	payload := &api.PushPayload{Owner: "o", Repo: "r", Sessions: []api.SessionData{{ID: "s1"}}}

	_, err := client.Push(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if callbackCount != 1 {
		t.Errorf("expected OnRateLimit called once, got %d", callbackCount)
	}
	if callbackDuration != 15*time.Second {
		t.Errorf("expected 15s retry-after, got %v", callbackDuration)
	}
}

func TestPush_5xxRetry(t *testing.T) {
	var requestCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := requestCount.Add(1)
		if n == 1 {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		resp := api.PushResponse{OK: true, Entities: map[string]int{"sessions": 1}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	payload := &api.PushPayload{Owner: "o", Repo: "r", Sessions: []api.SessionData{{ID: "s1"}}}

	resp, err := client.Push(payload)
	if err != nil {
		t.Fatalf("expected success after 5xx retry, got: %v", err)
	}
	if !resp.OK {
		t.Error("expected OK response")
	}
	if requestCount.Load() != 2 {
		t.Errorf("expected 2 requests, got %d", requestCount.Load())
	}
}

func TestParseRetryAfter(t *testing.T) {
	tests := []struct {
		header string
		want   time.Duration
	}{
		{"", defaultRetryAfter},
		{"30", 30 * time.Second},
		{"1", 1 * time.Second},
		{"invalid", defaultRetryAfter},
		{"-5", defaultRetryAfter},
		{"0", defaultRetryAfter},
	}

	for _, tt := range tests {
		t.Run("header="+tt.header, func(t *testing.T) {
			got := parseRetryAfter(tt.header)
			if got != tt.want {
				t.Errorf("parseRetryAfter(%q) = %v, want %v", tt.header, got, tt.want)
			}
		})
	}
}

func TestRateLimitError_Error(t *testing.T) {
	err := &RateLimitError{RetryAfter: 30 * time.Second}
	want := "rate limited (retry after 30s)"
	if got := err.Error(); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestWithOnRateLimit(t *testing.T) {
	client := NewClient("http://example.com", "key")
	called := false
	clone := client.WithOnRateLimit(func(d time.Duration) { called = true })

	// Clone should have the callback, original should not.
	if clone.OnRateLimit == nil {
		t.Error("expected clone to have OnRateLimit set")
	}
	if client.OnRateLimit != nil {
		t.Error("expected original client to not have OnRateLimit set")
	}

	// Clone should share the same HTTP client.
	if clone.HTTPClient != client.HTTPClient {
		t.Error("expected clone to share HTTPClient")
	}

	clone.OnRateLimit(time.Second)
	if !called {
		t.Error("expected callback to be called")
	}
}
