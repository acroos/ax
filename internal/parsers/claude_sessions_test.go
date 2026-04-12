package parsers

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadHistory(t *testing.T) {
	home, _ := os.UserHomeDir()
	claudeDir := filepath.Join(home, ".claude")

	if _, err := os.Stat(filepath.Join(claudeDir, "history.jsonl")); os.IsNotExist(err) {
		t.Skip("no ~/.claude/history.jsonl found")
	}

	sessions, err := LoadHistory(claudeDir)
	if err != nil {
		t.Fatalf("failed to load history: %v", err)
	}

	if len(sessions) == 0 {
		t.Fatal("expected at least one session in history")
	}

	// Verify entries have required fields
	for sessionID, entries := range sessions {
		if sessionID == "" {
			t.Error("found empty session ID")
		}
		for _, entry := range entries {
			if entry.Timestamp == 0 {
				t.Errorf("session %s has entry with zero timestamp", sessionID)
			}
		}
		break // just check first session
	}
}

func TestFindSessionFiles(t *testing.T) {
	home, _ := os.UserHomeDir()
	claudeDir := filepath.Join(home, ".claude")

	files, err := FindSessionFiles(claudeDir, "/Users/austinroos/dev/spray-wall-app")
	if err != nil {
		t.Fatalf("failed to find session files: %v", err)
	}

	if len(files) == 0 {
		t.Skip("no session files found for spray-wall-app")
	}

	for _, f := range files {
		if !filepath.IsAbs(f) {
			t.Errorf("expected absolute path, got %s", f)
		}
		if filepath.Ext(f) != ".jsonl" {
			t.Errorf("expected .jsonl extension, got %s", f)
		}
	}
}

func TestParseSession(t *testing.T) {
	home, _ := os.UserHomeDir()
	claudeDir := filepath.Join(home, ".claude")

	files, err := FindSessionFiles(claudeDir, "/Users/austinroos/dev/spray-wall-app")
	if err != nil || len(files) == 0 {
		t.Skip("no session files found for spray-wall-app")
	}

	session, err := ParseSession(files[0])
	if err != nil {
		t.Fatalf("failed to parse session: %v", err)
	}

	if session.ID == "" {
		t.Error("expected non-empty session ID")
	}

	t.Logf("Session %s:", session.ID)
	t.Logf("  Branch: %s", session.Branch)
	t.Logf("  Human messages: %d", session.HumanMessages)
	t.Logf("  Assistant messages: %d", session.AssistantMessages)
	t.Logf("  Turn count: %d", session.TurnCount)
	t.Logf("  Input tokens: %d", session.InputTokens)
	t.Logf("  Output tokens: %d", session.OutputTokens)
	t.Logf("  Total cost: $%.2f", session.TotalCostUSD)
	t.Logf("  Primary model: %s", session.PrimaryModel)
	t.Logf("  Files read: %d", len(session.FilesRead))
	t.Logf("  Files modified: %d", len(session.FilesModified))
	t.Logf("  Tool calls: %v", session.ToolCalls)
	t.Logf("  Bash errors: %d", session.BashErrors)
	t.Logf("  Bash successes: %d", session.BashSuccesses)
	t.Logf("  PR URLs: %v", session.PRURLs)
	t.Logf("  Commit SHAs: %v", session.CommitSHAs)

	// Basic sanity checks
	if session.AssistantMessages == 0 {
		t.Error("expected at least one assistant message")
	}
	if session.InputTokens == 0 {
		t.Error("expected non-zero input tokens")
	}
	if session.PrimaryModel == "" {
		t.Error("expected non-empty primary model")
	}
}

func TestFindSessionFilesIncludesWorktrees(t *testing.T) {
	// Set up a fake ~/.claude directory structure
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myrepo"
	encodedRepo := "-Users-dev-myrepo"

	// Create main repo session directory with a session file
	mainDir := filepath.Join(projectsDir, encodedRepo)
	if err := os.MkdirAll(mainDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mainDir, "session1.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create a worktree session directory with a session file
	wtDir := filepath.Join(projectsDir, encodedRepo+"-.claude-worktrees-feature-branch")
	if err := os.MkdirAll(wtDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wtDir, "session2.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create an unrelated project directory that should NOT be included
	unrelatedDir := filepath.Join(projectsDir, encodedRepo+"-subdir")
	if err := os.MkdirAll(unrelatedDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(unrelatedDir, "session3.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := FindSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("FindSessionFiles failed: %v", err)
	}

	if len(files) != 2 {
		t.Fatalf("expected 2 session files (main + worktree), got %d: %v", len(files), files)
	}

	// Verify we got the right files
	basenames := map[string]bool{}
	for _, f := range files {
		basenames[filepath.Base(f)] = true
	}
	if !basenames["session1.jsonl"] {
		t.Error("missing main repo session file")
	}
	if !basenames["session2.jsonl"] {
		t.Error("missing worktree session file")
	}
	if basenames["session3.jsonl"] {
		t.Error("unrelated session file should not be included")
	}
}

func TestFindSessionFilesWorktreeOnly(t *testing.T) {
	// Test case where main repo has no sessions but worktree does
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myrepo"
	encodedRepo := "-Users-dev-myrepo"

	wtDir := filepath.Join(projectsDir, encodedRepo+"-.claude-worktrees-bugfix")
	if err := os.MkdirAll(wtDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wtDir, "session1.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := FindSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("FindSessionFiles failed: %v", err)
	}

	if len(files) != 1 {
		t.Fatalf("expected 1 worktree session file, got %d", len(files))
	}
}

func TestIsHumanMessage(t *testing.T) {
	tests := []struct {
		content string
		want    bool
	}{
		{"Hello, can you help me?", true},
		{"<command-name>/clear</command-name>", false},
		{"<local-command-caveat>something</local-command-caveat>", false},
		{"[{\"type\":\"tool_result\"}]", false},
		{"", false},
	}

	for _, tt := range tests {
		got := isHumanMessage(tt.content)
		if got != tt.want {
			t.Errorf("isHumanMessage(%q) = %v, want %v", tt.content[:min(len(tt.content), 30)], got, tt.want)
		}
	}
}

func TestExtractPRURLs(t *testing.T) {
	seen := make(map[string]bool)
	extractPRURLs("Created PR https://github.com/acroos/spray-wall-app/pull/5\nDone.", seen)

	if len(seen) != 1 {
		t.Fatalf("expected 1 PR URL, got %d", len(seen))
	}
	if !seen["https://github.com/acroos/spray-wall-app/pull/5"] {
		t.Errorf("expected PR URL not found, got %v", seen)
	}
}

func TestExtractCommitSHAs(t *testing.T) {
	seen := make(map[string]bool)
	extractCommitSHAs("[main abc1234] Initial commit\n", seen)

	if len(seen) != 1 {
		t.Fatalf("expected 1 commit SHA, got %d", len(seen))
	}
	if !seen["abc1234"] {
		t.Errorf("expected SHA abc1234, got %v", seen)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
