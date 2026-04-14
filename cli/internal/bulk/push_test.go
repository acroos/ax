package bulk

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/push"
)

func TestChunkSessions(t *testing.T) {
	tests := []struct {
		name       string
		count      int
		wantChunks int
		wantLast   int // size of last chunk
	}{
		{"zero sessions", 0, 0, 0},
		{"under chunk size", 5, 1, 5},
		{"exact chunk size", 10, 1, 10},
		{"over chunk size", 25, 3, 5},
		{"single session", 1, 1, 1},
		{"just over", 11, 2, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := make([]api.SessionData, tt.count)
			for i := range sessions {
				sessions[i] = api.SessionData{ID: string(rune('a' + i%26))}
			}

			chunks := ChunkSessions(sessions)
			if len(chunks) != tt.wantChunks {
				t.Errorf("ChunkSessions(%d) = %d chunks, want %d", tt.count, len(chunks), tt.wantChunks)
			}
			if tt.wantChunks > 0 {
				lastLen := len(chunks[len(chunks)-1])
				if lastLen != tt.wantLast {
					t.Errorf("last chunk size = %d, want %d", lastLen, tt.wantLast)
				}
			}

			// Verify total count is preserved.
			total := 0
			for _, c := range chunks {
				total += len(c)
			}
			if total != tt.count {
				t.Errorf("total sessions in chunks = %d, want %d", total, tt.count)
			}
		})
	}
}

func TestBulkPush_AllSucceed(t *testing.T) {
	var requestCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)

		body, _ := io.ReadAll(r.Body)
		var payload api.PushPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Errorf("failed to unmarshal payload: %v", err)
			http.Error(w, "bad request", 400)
			return
		}

		resp := api.PushResponse{
			OK:       true,
			Entities: map[string]int{"sessions": len(payload.Sessions)},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := push.NewClient(server.URL, "test-key")

	// Create repos with session files (use temp JSONL files).
	tmpDir := t.TempDir()
	sessFiles := createTempSessions(t, tmpDir, 5)

	repos := []DiscoveredRepo{
		{
			Owner: "owner", Repo: "repo-a", OwnerRepo: "owner/repo-a",
			ProjectPaths: []string{"/fake/path"},
			SessionFiles: sessFiles[:3],
		},
		{
			Owner: "owner", Repo: "repo-b", OwnerRepo: "owner/repo-b",
			ProjectPaths: []string{"/fake/path2"},
			SessionFiles: sessFiles[3:],
		},
	}

	result := BulkPush(&BulkPushConfig{
		Client:      client,
		Repos:       repos,
		Concurrency: 2,
		Writer:      io.Discard,
	})

	if result.ReposPushed != 2 {
		t.Errorf("ReposPushed = %d, want 2", result.ReposPushed)
	}
	if result.ReposFailed != 0 {
		t.Errorf("ReposFailed = %d, want 0", result.ReposFailed)
	}
	if result.TotalFailed != 0 {
		t.Errorf("TotalFailed = %d, want 0", result.TotalFailed)
	}
	// Each repo should be 1 chunk (< 10 sessions).
	if requestCount.Load() != 2 {
		t.Errorf("server received %d requests, want 2", requestCount.Load())
	}
}

func TestBulkPush_ChunkedRequests(t *testing.T) {
	var requestCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		resp := api.PushResponse{OK: true, Entities: map[string]int{"sessions": 0}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := push.NewClient(server.URL, "test-key")

	// Create 25 session files — should result in 3 chunks.
	tmpDir := t.TempDir()
	sessFiles := createTempSessions(t, tmpDir, 25)

	repos := []DiscoveredRepo{
		{
			Owner: "owner", Repo: "big-repo", OwnerRepo: "owner/big-repo",
			ProjectPaths: []string{"/fake/path"},
			SessionFiles: sessFiles,
		},
	}

	result := BulkPush(&BulkPushConfig{
		Client:      client,
		Repos:       repos,
		Concurrency: 1,
		Writer:      io.Discard,
	})

	if result.ReposPushed != 1 {
		t.Errorf("ReposPushed = %d, want 1", result.ReposPushed)
	}
	if requestCount.Load() != 3 {
		t.Errorf("server received %d requests, want 3 (chunks of 10+10+5)", requestCount.Load())
	}
}

func TestBulkPush_PartialFailure(t *testing.T) {
	// Fail requests for the bad repo by checking the payload.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var payload api.PushPayload
		json.Unmarshal(body, &payload)

		if payload.Repo == "bad-repo" {
			http.Error(w, "internal server error", 500)
			return
		}
		resp := api.PushResponse{OK: true, Entities: map[string]int{"sessions": 0}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := push.NewClient(server.URL, "test-key")

	tmpDir := t.TempDir()
	sessFiles := createTempSessions(t, tmpDir, 5)

	repos := []DiscoveredRepo{
		{
			Owner: "owner", Repo: "good-repo", OwnerRepo: "owner/good-repo",
			ProjectPaths: []string{"/fake/good"},
			SessionFiles: sessFiles[:2],
		},
		{
			Owner: "owner", Repo: "bad-repo", OwnerRepo: "owner/bad-repo",
			ProjectPaths: []string{"/fake/bad"},
			SessionFiles: sessFiles[2:],
		},
	}

	result := BulkPush(&BulkPushConfig{
		Client:      client,
		Repos:       repos,
		Concurrency: 1, // sequential to control request ordering
		Writer:      io.Discard,
	})

	if result.ReposFailed != 1 {
		t.Errorf("ReposFailed = %d, want 1", result.ReposFailed)
	}
	if result.ReposPushed != 1 {
		t.Errorf("ReposPushed = %d, want 1", result.ReposPushed)
	}
}

func TestWriteErrorLog(t *testing.T) {
	// Override home dir by writing to a temp dir.
	tmpDir := t.TempDir()
	origHome := os.Getenv("HOME")
	t.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", origHome)

	result := &BulkPushResult{
		Results: []RepoResult{
			{
				OwnerRepo:     "owner/good-repo",
				SessionsSent:  10,
				TotalSessions: 10,
			},
			{
				OwnerRepo:     "owner/bad-repo",
				RepoPath:      "/Users/a/dev/bad-repo",
				SessionsSent:  5,
				TotalSessions: 15,
				FailedChunks: []ChunkFailure{
					{ChunkIndex: 2, SessionIDs: []string{"s1", "s2"}, Err: errTest("server error: 500")},
				},
			},
		},
		TotalSent:   15,
		TotalFailed: 10,
		ReposPushed: 1,
		ReposFailed: 1,
	}

	logPath, err := WriteErrorLog(result)
	if err != nil {
		t.Fatalf("WriteErrorLog() error: %v", err)
	}

	if !strings.Contains(logPath, "bulk-push-") {
		t.Errorf("log path %q doesn't contain expected prefix", logPath)
	}

	content, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("could not read log file: %v", err)
	}

	text := string(content)
	if !strings.Contains(text, "owner/bad-repo") {
		t.Error("log doesn't contain failed repo name")
	}
	if !strings.Contains(text, "/Users/a/dev/bad-repo") {
		t.Error("log doesn't contain repo path")
	}
	if !strings.Contains(text, "Chunk 2 failed") {
		t.Error("log doesn't contain chunk failure info")
	}
	if !strings.Contains(text, "ax push --repo") {
		t.Error("log doesn't contain retry hint")
	}

	// Good repo should not appear in error log.
	if strings.Contains(text, "good-repo") {
		t.Error("log should not contain successful repo")
	}
}

// createTempSessions creates minimal JSONL session files and returns their paths.
func createTempSessions(t *testing.T, dir string, count int) []string {
	t.Helper()
	sessDir := filepath.Join(dir, "sessions")
	if err := os.MkdirAll(sessDir, 0o755); err != nil {
		t.Fatal(err)
	}

	paths := make([]string, count)
	for i := 0; i < count; i++ {
		name := filepath.Join(sessDir, strings.Repeat("a", 8)+string(rune('0'+i/100))+string(rune('0'+(i/10)%10))+string(rune('0'+i%10))+".jsonl")
		// Write a minimal valid session line.
		line := `{"type":"assistant","sessionId":"` + filepath.Base(name[:len(name)-6]) + `","timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"assistant","content":"hi","model":"claude-sonnet-4-20250514","usage":{"input_tokens":10,"output_tokens":5}}}`
		if err := os.WriteFile(name, []byte(line+"\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		paths[i] = name
	}
	return paths
}

type errTest string

func (e errTest) Error() string { return string(e) }
