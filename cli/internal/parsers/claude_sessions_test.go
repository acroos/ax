package parsers

import (
	"os"
	"path/filepath"
	"testing"
)

func testdataPath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("testdata", name)
}

// --- LoadHistory ---

func TestLoadHistory(t *testing.T) {
	claudeDir := t.TempDir()
	src, err := os.ReadFile(testdataPath(t, "history.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "history.jsonl"), src, 0o644); err != nil {
		t.Fatal(err)
	}

	sessions, err := LoadHistory(claudeDir)
	if err != nil {
		t.Fatalf("LoadHistory failed: %v", err)
	}

	if got := len(sessions); got != 2 {
		t.Fatalf("expected 2 sessions, got %d", got)
	}
	if got := len(sessions["session-abc-123"]); got != 2 {
		t.Errorf("session-abc-123: expected 2 entries, got %d", got)
	}
	if got := len(sessions["session-def-456"]); got != 1 {
		t.Errorf("session-def-456: expected 1 entry, got %d", got)
	}

	for _, entry := range sessions["session-abc-123"] {
		if entry.Timestamp == 0 {
			t.Error("expected non-zero timestamp")
		}
		if entry.Project == "" {
			t.Error("expected non-empty project")
		}
	}
}

func TestLoadHistoryMissing(t *testing.T) {
	claudeDir := t.TempDir()
	_, err := LoadHistory(claudeDir)
	if err == nil {
		t.Fatal("expected error for missing history.jsonl")
	}
}

// --- FindSessionFiles ---

func TestFindSessionFiles(t *testing.T) {
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myproject"
	encodedPath := "-Users-dev-myproject"

	projDir := filepath.Join(projectsDir, encodedPath)
	if err := os.MkdirAll(projDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"session1.jsonl", "session2.jsonl"} {
		if err := os.WriteFile(filepath.Join(projDir, name), []byte("{}"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	files, err := FindSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("FindSessionFiles failed: %v", err)
	}

	if got := len(files); got != 2 {
		t.Fatalf("expected 2 files, got %d", got)
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

func TestFindSessionFilesNoProject(t *testing.T) {
	claudeDir := t.TempDir()
	files, err := FindSessionFiles(claudeDir, "/nonexistent/path")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected 0 files, got %d", len(files))
	}
}

func TestFindSessionFilesIncludesWorktrees(t *testing.T) {
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myrepo"
	encodedRepo := "-Users-dev-myrepo"

	mainDir := filepath.Join(projectsDir, encodedRepo)
	if err := os.MkdirAll(mainDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mainDir, "session1.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	wtDir := filepath.Join(projectsDir, encodedRepo+"--claude-worktrees-feature-branch")
	if err := os.MkdirAll(wtDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wtDir, "session2.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Unrelated project that should NOT be included
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
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myrepo"
	encodedRepo := "-Users-dev-myrepo"

	wtDir := filepath.Join(projectsDir, encodedRepo+"--claude-worktrees-bugfix")
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

func TestFindSessionFilesDirectoryOnly(t *testing.T) {
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/spray-wall"
	encodedPath := "-Users-dev-spray-wall"

	projDir := filepath.Join(projectsDir, encodedPath)

	// Create a session as a UUID directory with subagent files (no top-level .jsonl).
	sessionID := "580d904d-96af-4905-865b-70a8d476d203"
	subagentDir := filepath.Join(projDir, sessionID, "subagents")
	if err := os.MkdirAll(subagentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subagentDir, "agent-abc.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := FindSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("FindSessionFiles failed: %v", err)
	}

	if len(files) != 1 {
		t.Fatalf("expected 1 session path, got %d: %v", len(files), files)
	}
	if filepath.Base(files[0]) != sessionID {
		t.Errorf("expected session dir %q, got %q", sessionID, filepath.Base(files[0]))
	}
}

func TestFindSessionFilesMixed(t *testing.T) {
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myproject"
	encodedPath := "-Users-dev-myproject"

	projDir := filepath.Join(projectsDir, encodedPath)
	if err := os.MkdirAll(projDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Session 1: traditional .jsonl file.
	if err := os.WriteFile(filepath.Join(projDir, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Session 2: directory-only (no .jsonl).
	session2 := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	subDir := filepath.Join(projDir, session2, "subagents")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subDir, "agent-x.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := FindSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("FindSessionFiles failed: %v", err)
	}

	if len(files) != 2 {
		t.Fatalf("expected 2 session paths (1 file + 1 dir), got %d: %v", len(files), files)
	}
}

func TestFindSessionFilesSkipsDirectoryWithJSONL(t *testing.T) {
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myproject"
	encodedPath := "-Users-dev-myproject"

	projDir := filepath.Join(projectsDir, encodedPath)
	if err := os.MkdirAll(projDir, 0o755); err != nil {
		t.Fatal(err)
	}

	sessionID := "cccccccc-cccc-cccc-cccc-cccccccccccc"

	// Create both a .jsonl file and a directory for the same session.
	if err := os.WriteFile(filepath.Join(projDir, sessionID+".jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	subDir := filepath.Join(projDir, sessionID, "subagents")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subDir, "agent-y.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := FindSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("FindSessionFiles failed: %v", err)
	}

	// Only the .jsonl file should be returned, not the directory.
	if len(files) != 1 {
		t.Fatalf("expected 1 session path (only .jsonl), got %d: %v", len(files), files)
	}
	if filepath.Ext(files[0]) != ".jsonl" {
		t.Errorf("expected .jsonl file, got %q", files[0])
	}
}

func TestFindSessionFilesIgnoresNonUUIDDirs(t *testing.T) {
	claudeDir := t.TempDir()
	projectsDir := filepath.Join(claudeDir, "projects")

	repoPath := "/Users/dev/myproject"
	encodedPath := "-Users-dev-myproject"

	projDir := filepath.Join(projectsDir, encodedPath)
	if err := os.MkdirAll(projDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a non-UUID directory (e.g. "memory") with JSONL files inside.
	nonUUID := filepath.Join(projDir, "memory", "subagents")
	if err := os.MkdirAll(nonUUID, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nonUUID, "agent-z.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := FindSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("FindSessionFiles failed: %v", err)
	}

	if len(files) != 0 {
		t.Fatalf("expected 0 session paths (non-UUID dir should be ignored), got %d: %v", len(files), files)
	}
}

func TestIsSessionUUID(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"580d904d-96af-4905-865b-70a8d476d203", true},
		{"00000000-0000-0000-0000-000000000000", true},
		{"ABCDEF01-2345-6789-abcd-ef0123456789", true},
		{"memory", false},
		{"subagents", false},
		{"session1.jsonl", false},
		{"580d904d96af4905865b70a8d476d203", false},      // no dashes
		{"580d904d-96af-4905-865b-70a8d476d20", false},   // too short
		{"580d904d-96af-4905-865b-70a8d476d2030", false}, // too long
		{"580d904d-96af-4905-865b-70a8d476d20g", false},  // invalid hex
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isSessionUUID(tt.name); got != tt.want {
				t.Errorf("isSessionUUID(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}

// --- ParseSession ---

func TestParseSessionNormal(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "normal_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	if session.ID != "normal_session" {
		t.Errorf("ID = %q, want %q", session.ID, "normal_session")
	}
	if session.Branch != "feature/fix-bug" {
		t.Errorf("Branch = %q, want %q", session.Branch, "feature/fix-bug")
	}

	// Timestamps
	if session.StartedAt == 0 || session.EndedAt == 0 {
		t.Error("expected non-zero timestamps")
	}
	if session.StartedAt > session.EndedAt {
		t.Errorf("StartedAt (%d) > EndedAt (%d)", session.StartedAt, session.EndedAt)
	}

	// Message counts: 2 human messages, 3 assistant, 2 turns
	if session.HumanMessages != 2 {
		t.Errorf("HumanMessages = %d, want 2", session.HumanMessages)
	}
	if session.AssistantMessages != 3 {
		t.Errorf("AssistantMessages = %d, want 3", session.AssistantMessages)
	}
	if session.TurnCount != 2 {
		t.Errorf("TurnCount = %d, want 2", session.TurnCount)
	}

	// Token usage (summed across 3 assistant messages)
	if session.InputTokens != 3000 {
		t.Errorf("InputTokens = %d, want 3000", session.InputTokens)
	}
	if session.OutputTokens != 700 {
		t.Errorf("OutputTokens = %d, want 700", session.OutputTokens)
	}
	if session.CacheCreationInputTokens != 50 {
		t.Errorf("CacheCreationInputTokens = %d, want 50", session.CacheCreationInputTokens)
	}
	if session.CacheReadInputTokens != 300 {
		t.Errorf("CacheReadInputTokens = %d, want 300", session.CacheReadInputTokens)
	}

	// Model
	if session.PrimaryModel != "claude-sonnet-4-5-20250514" {
		t.Errorf("PrimaryModel = %q, want %q", session.PrimaryModel, "claude-sonnet-4-5-20250514")
	}

	// Tool calls
	if session.ToolCalls["Read"] != 1 {
		t.Errorf("ToolCalls[Read] = %d, want 1", session.ToolCalls["Read"])
	}
	if session.ToolCalls["Edit"] != 1 {
		t.Errorf("ToolCalls[Edit] = %d, want 1", session.ToolCalls["Edit"])
	}

	// Files
	if len(session.FilesRead) != 1 || session.FilesRead[0] != "/src/main.go" {
		t.Errorf("FilesRead = %v, want [\"/src/main.go\"]", session.FilesRead)
	}
	if len(session.FilesModified) != 1 || session.FilesModified[0] != "/src/main.go" {
		t.Errorf("FilesModified = %v, want [\"/src/main.go\"]", session.FilesModified)
	}
	if session.TotalFileReads != 1 {
		t.Errorf("TotalFileReads = %d, want 1", session.TotalFileReads)
	}

	// No signals in this session
	if len(session.PRURLs) != 0 {
		t.Errorf("PRURLs = %v, want empty", session.PRURLs)
	}
	if len(session.CommitSHAs) != 0 {
		t.Errorf("CommitSHAs = %v, want empty", session.CommitSHAs)
	}
}

func TestParseSessionMultiModel(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "multi_model_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	// 2 sonnet messages vs 1 opus — sonnet wins majority vote
	if session.PrimaryModel != "claude-sonnet-4-5-20250514" {
		t.Errorf("PrimaryModel = %q, want %q (2 sonnet vs 1 opus)",
			session.PrimaryModel, "claude-sonnet-4-5-20250514")
	}
	if session.AssistantMessages != 3 {
		t.Errorf("AssistantMessages = %d, want 3", session.AssistantMessages)
	}
	if session.HumanMessages != 3 {
		t.Errorf("HumanMessages = %d, want 3", session.HumanMessages)
	}
	if session.TurnCount != 3 {
		t.Errorf("TurnCount = %d, want 3", session.TurnCount)
	}
}

func TestParseSessionSignalExtraction(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "signals_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	// Commit SHA from git commit output
	if len(session.CommitSHAs) != 1 {
		t.Fatalf("CommitSHAs length = %d, want 1; got %v", len(session.CommitSHAs), session.CommitSHAs)
	}
	if session.CommitSHAs[0] != "a1b2c3d" {
		t.Errorf("CommitSHAs[0] = %q, want %q", session.CommitSHAs[0], "a1b2c3d")
	}

	// PR URL from gh pr create output
	if len(session.PRURLs) != 1 {
		t.Fatalf("PRURLs length = %d, want 1; got %v", len(session.PRURLs), session.PRURLs)
	}
	if session.PRURLs[0] != "https://github.com/testorg/testrepo/pull/42" {
		t.Errorf("PRURLs[0] = %q, want %q", session.PRURLs[0], "https://github.com/testorg/testrepo/pull/42")
	}

	// Both Bash tool calls tracked
	if session.ToolCalls["Bash"] != 2 {
		t.Errorf("ToolCalls[Bash] = %d, want 2", session.ToolCalls["Bash"])
	}
}

func TestParseSessionDirectory(t *testing.T) {
	// Create a session directory with subagent JSONL files.
	dir := t.TempDir()
	sessionID := "580d904d-96af-4905-865b-70a8d476d203"
	sessionDir := filepath.Join(dir, sessionID)
	subagentDir := filepath.Join(sessionDir, "subagents")
	if err := os.MkdirAll(subagentDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Copy normal_session.jsonl as a subagent file.
	src, err := os.ReadFile(testdataPath(t, "normal_session.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subagentDir, "agent-abc123.jsonl"), src, 0o644); err != nil {
		t.Fatal(err)
	}

	session, err := ParseSession(sessionDir)
	if err != nil {
		t.Fatalf("ParseSession (directory) failed: %v", err)
	}

	// Session ID should come from the directory name, not the file.
	if session.ID != sessionID {
		t.Errorf("ID = %q, want %q", session.ID, sessionID)
	}
	if session.HumanMessages != 2 {
		t.Errorf("HumanMessages = %d, want 2", session.HumanMessages)
	}
	if session.AssistantMessages != 3 {
		t.Errorf("AssistantMessages = %d, want 3", session.AssistantMessages)
	}
}

func TestParseSessionDirectoryMultipleFiles(t *testing.T) {
	// Create a session directory with two subagent JSONL files.
	dir := t.TempDir()
	sessionID := "12345678-1234-1234-1234-123456789abc"
	sessionDir := filepath.Join(dir, sessionID)
	subagentDir := filepath.Join(sessionDir, "subagents")
	if err := os.MkdirAll(subagentDir, 0o755); err != nil {
		t.Fatal(err)
	}

	src, err := os.ReadFile(testdataPath(t, "normal_session.jsonl"))
	if err != nil {
		t.Fatal(err)
	}

	// Write two subagent files with the same content.
	for _, name := range []string{"agent-aaa.jsonl", "agent-bbb.jsonl"} {
		if err := os.WriteFile(filepath.Join(subagentDir, name), src, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	session, err := ParseSession(sessionDir)
	if err != nil {
		t.Fatalf("ParseSession (multi-file directory) failed: %v", err)
	}

	// Tokens should accumulate across both files (message dedup applies by ID).
	// normal_session.jsonl has 3 assistant messages with IDs msg_001, msg_002, msg_003.
	// Second file has the same IDs, so they get deduplicated.
	if session.AssistantMessages != 3 {
		t.Errorf("AssistantMessages = %d, want 3 (deduped across files)", session.AssistantMessages)
	}
}

func TestParseSessionEmpty(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "empty_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	if session.ID != "empty_session" {
		t.Errorf("ID = %q, want %q", session.ID, "empty_session")
	}
	if session.HumanMessages != 0 {
		t.Errorf("HumanMessages = %d, want 0", session.HumanMessages)
	}
	if session.AssistantMessages != 0 {
		t.Errorf("AssistantMessages = %d, want 0", session.AssistantMessages)
	}
	if session.InputTokens != 0 {
		t.Errorf("InputTokens = %d, want 0", session.InputTokens)
	}
}

func TestParseSessionMalformedLines(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "malformed_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	// 2 valid lines out of 4: one assistant, one human
	if session.AssistantMessages != 1 {
		t.Errorf("AssistantMessages = %d, want 1", session.AssistantMessages)
	}
	if session.HumanMessages != 1 {
		t.Errorf("HumanMessages = %d, want 1", session.HumanMessages)
	}
	if session.InputTokens != 100 {
		t.Errorf("InputTokens = %d, want 100", session.InputTokens)
	}
}

func TestParseSessionSidechain(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "sidechain_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	if session.SidechainMessages != 2 {
		t.Errorf("SidechainMessages = %d, want 2", session.SidechainMessages)
	}
	if session.HumanMessages != 2 {
		t.Errorf("HumanMessages = %d, want 2", session.HumanMessages)
	}
	if session.AssistantMessages != 2 {
		t.Errorf("AssistantMessages = %d, want 2", session.AssistantMessages)
	}
}

func TestParseSessionToolUsageCategorization(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "tool_usage_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	// Tool call counts: Read(1) + Agent(2) + Skill(1) + mcp__linear(1) + mcp__slack(1) + Edit(1) = 7
	if session.TotalToolCalls != 7 {
		t.Errorf("TotalToolCalls = %d, want 7", session.TotalToolCalls)
	}
	if session.AgentToolCalls != 2 {
		t.Errorf("AgentToolCalls = %d, want 2", session.AgentToolCalls)
	}
	if session.SkillToolCalls != 1 {
		t.Errorf("SkillToolCalls = %d, want 1", session.SkillToolCalls)
	}
	if session.McpToolCalls != 2 {
		t.Errorf("McpToolCalls = %d, want 2", session.McpToolCalls)
	}

	// Verify individual tool counts in the map
	if session.ToolCalls["Agent"] != 2 {
		t.Errorf("ToolCalls[Agent] = %d, want 2", session.ToolCalls["Agent"])
	}
	if session.ToolCalls["Skill"] != 1 {
		t.Errorf("ToolCalls[Skill] = %d, want 1", session.ToolCalls["Skill"])
	}
	if session.ToolCalls["mcp__linear__create_issue"] != 1 {
		t.Errorf("ToolCalls[mcp__linear__create_issue] = %d, want 1", session.ToolCalls["mcp__linear__create_issue"])
	}
	if session.ToolCalls["mcp__slack__send_message"] != 1 {
		t.Errorf("ToolCalls[mcp__slack__send_message] = %d, want 1", session.ToolCalls["mcp__slack__send_message"])
	}
}

func TestParseSessionPeakContextTokens(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "tool_usage_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	// Message usage (input + cache_creation + cache_read):
	// msg_001: 50000 + 10000 + 140000 = 200000
	// msg_002: 80000 + 5000 + 100000 = 185000
	// msg_003: 30000 + 0 + 50000 = 80000
	// Peak should be 200000 (msg_001)
	if session.PeakContextTokens != 200000 {
		t.Errorf("PeakContextTokens = %d, want 200000", session.PeakContextTokens)
	}
}

func TestToSessionDataPeakContextPct(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "tool_usage_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	sd := session.ToSessionData()

	// Model is claude-opus-4-6[1m] → max context = 1,000,000
	// PeakContextPct = 200000 / 1000000 = 0.2
	if diff := sd.PeakContextPct - 0.2; diff > 0.001 || diff < -0.001 {
		t.Errorf("PeakContextPct = %f, want 0.2", sd.PeakContextPct)
	}

	// Verify tool counts are passed through
	if sd.TotalToolCalls != 7 {
		t.Errorf("SessionData.TotalToolCalls = %d, want 7", sd.TotalToolCalls)
	}
	if sd.AgentToolCalls != 2 {
		t.Errorf("SessionData.AgentToolCalls = %d, want 2", sd.AgentToolCalls)
	}
	if sd.SkillToolCalls != 1 {
		t.Errorf("SessionData.SkillToolCalls = %d, want 1", sd.SkillToolCalls)
	}
	if sd.McpToolCalls != 2 {
		t.Errorf("SessionData.McpToolCalls = %d, want 2", sd.McpToolCalls)
	}
}

func TestToSessionDataPeakContextPctStandardModel(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "normal_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	sd := session.ToSessionData()

	// Model is claude-sonnet-4-5-20250514 → max context = 200,000
	// normal_session msg usage (input + cache_creation + cache_read):
	// msg_001: 1000 + 50 + 100 = 1150
	// msg_002: 1500 + 0 + 150 = 1650
	// msg_003: 500 + 0 + 50 = 550
	// Peak = 1650, pct = 1650 / 200000 = 0.00825
	expectedPct := 1650.0 / 200000.0
	if diff := sd.PeakContextPct - expectedPct; diff > 0.0001 || diff < -0.0001 {
		t.Errorf("PeakContextPct = %f, want %f", sd.PeakContextPct, expectedPct)
	}
}

func TestParseSessionDeduplicatesMessages(t *testing.T) {
	session, err := ParseSession(testdataPath(t, "duplicate_messages_session.jsonl"))
	if err != nil {
		t.Fatalf("ParseSession failed: %v", err)
	}

	// Two lines with same message ID should count as 1
	if session.AssistantMessages != 1 {
		t.Errorf("AssistantMessages = %d, want 1 (deduped)", session.AssistantMessages)
	}
	// Tokens should only be counted once
	if session.InputTokens != 100 {
		t.Errorf("InputTokens = %d, want 100 (deduped)", session.InputTokens)
	}
}

// --- Unit tests for helper functions ---

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
	tests := []struct {
		name string
		text string
		want []string
	}{
		{
			name: "single PR URL",
			text: "Created PR https://github.com/acroos/spray-wall-app/pull/5\nDone.",
			want: []string{"https://github.com/acroos/spray-wall-app/pull/5"},
		},
		{
			name: "no PR URL",
			text: "All done, no PR created.",
			want: nil,
		},
		{
			name: "multiple PR URLs",
			text: "https://github.com/org/repo/pull/1 and https://github.com/org/repo/pull/2",
			want: []string{"https://github.com/org/repo/pull/1", "https://github.com/org/repo/pull/2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seen := make(map[string]bool)
			extractPRURLs(tt.text, seen)
			if len(seen) != len(tt.want) {
				t.Fatalf("got %d URLs, want %d: %v", len(seen), len(tt.want), seen)
			}
			for _, url := range tt.want {
				if !seen[url] {
					t.Errorf("missing expected URL %q", url)
				}
			}
		})
	}
}

func TestExtractCommitSHAs(t *testing.T) {
	tests := []struct {
		name string
		text string
		want []string
	}{
		{
			name: "standard commit output",
			text: "[main abc1234] Initial commit\n",
			want: []string{"abc1234"},
		},
		{
			name: "branch with slash",
			text: "[feature/auth f9e8d7c] fix: resolve auth bug\n 2 files changed",
			want: []string{"f9e8d7c"},
		},
		{
			name: "no commit output",
			text: "nothing to commit, working tree clean",
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seen := make(map[string]bool)
			extractCommitSHAs(tt.text, seen)
			if len(seen) != len(tt.want) {
				t.Fatalf("got %d SHAs, want %d: %v", len(seen), len(tt.want), seen)
			}
			for _, sha := range tt.want {
				if !seen[sha] {
					t.Errorf("missing expected SHA %q", sha)
				}
			}
		})
	}
}
