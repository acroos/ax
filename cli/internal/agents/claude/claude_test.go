package claude

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/agents"
)

func testdataPath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("testdata", name)
}

// --- Provider tests ---

func TestProviderID(t *testing.T) {
	p := New()
	if p.ID() != agents.ClaudeCode {
		t.Errorf("ID() = %q, want %q", p.ID(), agents.ClaudeCode)
	}
}

func TestProviderDiscoverSessionsWithoutLocalPathReturnsNil(t *testing.T) {
	p := New()
	locs, err := p.DiscoverSessions(agents.DiscoveryTarget{OwnerRepo: "owner/repo"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if locs != nil {
		t.Errorf("expected nil locators when LocalPath is empty, got %v", locs)
	}
}

func TestProviderParseSetsAgentType(t *testing.T) {
	p := New()
	loc := agents.SessionLocator{
		AgentID:   agents.ClaudeCode,
		SessionID: "normal_session",
		Path:      testdataPath(t, "normal_session.jsonl"),
	}
	sess, err := p.Parse(loc)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if sess.AgentType != "claude_code" {
		t.Errorf("AgentType = %q, want claude_code", sess.AgentType)
	}
}

// --- findSessionFiles ---

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

	files, err := findSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("findSessionFiles failed: %v", err)
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
	files, err := findSessionFiles(claudeDir, "/nonexistent/path")
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

	unrelatedDir := filepath.Join(projectsDir, encodedRepo+"-subdir")
	if err := os.MkdirAll(unrelatedDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(unrelatedDir, "session3.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := findSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("findSessionFiles failed: %v", err)
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

	files, err := findSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("findSessionFiles failed: %v", err)
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

	sessionID := "580d904d-96af-4905-865b-70a8d476d203"
	subagentDir := filepath.Join(projDir, sessionID, "subagents")
	if err := os.MkdirAll(subagentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subagentDir, "agent-abc.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := findSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("findSessionFiles failed: %v", err)
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

	if err := os.WriteFile(filepath.Join(projDir, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	session2 := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	subDir := filepath.Join(projDir, session2, "subagents")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subDir, "agent-x.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := findSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("findSessionFiles failed: %v", err)
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

	files, err := findSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("findSessionFiles failed: %v", err)
	}

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

	nonUUID := filepath.Join(projDir, "memory", "subagents")
	if err := os.MkdirAll(nonUUID, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nonUUID, "agent-z.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := findSessionFiles(claudeDir, repoPath)
	if err != nil {
		t.Fatalf("findSessionFiles failed: %v", err)
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
		{"580d904d96af4905865b70a8d476d203", false},
		{"580d904d-96af-4905-865b-70a8d476d20", false},
		{"580d904d-96af-4905-865b-70a8d476d2030", false},
		{"580d904d-96af-4905-865b-70a8d476d20g", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isSessionUUID(tt.name); got != tt.want {
				t.Errorf("isSessionUUID(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}

// --- parseSession ---

func TestParseSessionNormal(t *testing.T) {
	session, err := parseSession(testdataPath(t, "normal_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
	}

	if session.ID != "normal_session" {
		t.Errorf("ID = %q, want %q", session.ID, "normal_session")
	}
	if session.Branch != "feature/fix-bug" {
		t.Errorf("Branch = %q, want %q", session.Branch, "feature/fix-bug")
	}

	if session.StartedAt == 0 || session.EndedAt == 0 {
		t.Error("expected non-zero timestamps")
	}
	if session.StartedAt > session.EndedAt {
		t.Errorf("StartedAt (%d) > EndedAt (%d)", session.StartedAt, session.EndedAt)
	}

	if session.HumanMessages != 2 {
		t.Errorf("HumanMessages = %d, want 2", session.HumanMessages)
	}
	if session.AssistantMessages != 3 {
		t.Errorf("AssistantMessages = %d, want 3", session.AssistantMessages)
	}
	if session.TurnCount != 2 {
		t.Errorf("TurnCount = %d, want 2", session.TurnCount)
	}

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

	if session.PrimaryModel != "claude-sonnet-4-5-20250514" {
		t.Errorf("PrimaryModel = %q, want %q", session.PrimaryModel, "claude-sonnet-4-5-20250514")
	}

	if session.ToolCalls["Read"] != 1 {
		t.Errorf("ToolCalls[Read] = %d, want 1", session.ToolCalls["Read"])
	}
	if session.ToolCalls["Edit"] != 1 {
		t.Errorf("ToolCalls[Edit] = %d, want 1", session.ToolCalls["Edit"])
	}

	if len(session.FilesRead) != 1 || session.FilesRead[0] != "/src/main.go" {
		t.Errorf("FilesRead = %v, want [\"/src/main.go\"]", session.FilesRead)
	}
	if len(session.FilesModified) != 1 || session.FilesModified[0] != "/src/main.go" {
		t.Errorf("FilesModified = %v, want [\"/src/main.go\"]", session.FilesModified)
	}
	if session.TotalFileReads != 1 {
		t.Errorf("TotalFileReads = %d, want 1", session.TotalFileReads)
	}

	if len(session.PRURLs) != 0 {
		t.Errorf("PRURLs = %v, want empty", session.PRURLs)
	}
	if len(session.CommitSHAs) != 0 {
		t.Errorf("CommitSHAs = %v, want empty", session.CommitSHAs)
	}
}

func TestParseSessionMultiModel(t *testing.T) {
	session, err := parseSession(testdataPath(t, "multi_model_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
	}

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
	session, err := parseSession(testdataPath(t, "signals_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
	}

	if len(session.CommitSHAs) != 1 {
		t.Fatalf("CommitSHAs length = %d, want 1; got %v", len(session.CommitSHAs), session.CommitSHAs)
	}
	if session.CommitSHAs[0] != "a1b2c3d" {
		t.Errorf("CommitSHAs[0] = %q, want %q", session.CommitSHAs[0], "a1b2c3d")
	}

	if len(session.PRURLs) != 1 {
		t.Fatalf("PRURLs length = %d, want 1; got %v", len(session.PRURLs), session.PRURLs)
	}
	if session.PRURLs[0] != "https://github.com/testorg/testrepo/pull/42" {
		t.Errorf("PRURLs[0] = %q, want %q", session.PRURLs[0], "https://github.com/testorg/testrepo/pull/42")
	}

	if session.ToolCalls["Bash"] != 2 {
		t.Errorf("ToolCalls[Bash] = %d, want 2", session.ToolCalls["Bash"])
	}
}

func TestParseSessionDirectory(t *testing.T) {
	dir := t.TempDir()
	sessionID := "580d904d-96af-4905-865b-70a8d476d203"
	sessionDir := filepath.Join(dir, sessionID)
	subagentDir := filepath.Join(sessionDir, "subagents")
	if err := os.MkdirAll(subagentDir, 0o755); err != nil {
		t.Fatal(err)
	}

	src, err := os.ReadFile(testdataPath(t, "normal_session.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subagentDir, "agent-abc123.jsonl"), src, 0o644); err != nil {
		t.Fatal(err)
	}

	session, err := parseSession(sessionDir)
	if err != nil {
		t.Fatalf("parseSession (directory) failed: %v", err)
	}

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

	for _, name := range []string{"agent-aaa.jsonl", "agent-bbb.jsonl"} {
		if err := os.WriteFile(filepath.Join(subagentDir, name), src, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	session, err := parseSession(sessionDir)
	if err != nil {
		t.Fatalf("parseSession (multi-file directory) failed: %v", err)
	}

	if session.AssistantMessages != 3 {
		t.Errorf("AssistantMessages = %d, want 3 (deduped across files)", session.AssistantMessages)
	}
}

func TestParseSessionEmpty(t *testing.T) {
	session, err := parseSession(testdataPath(t, "empty_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
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
	session, err := parseSession(testdataPath(t, "malformed_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
	}

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
	session, err := parseSession(testdataPath(t, "sidechain_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
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
	session, err := parseSession(testdataPath(t, "tool_usage_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
	}

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
	session, err := parseSession(testdataPath(t, "tool_usage_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
	}

	if session.PeakContextTokens != 200000 {
		t.Errorf("PeakContextTokens = %d, want 200000", session.PeakContextTokens)
	}
}

func TestParseSessionDeduplicatesMessages(t *testing.T) {
	session, err := parseSession(testdataPath(t, "duplicate_messages_session.jsonl"))
	if err != nil {
		t.Fatalf("parseSession failed: %v", err)
	}

	if session.AssistantMessages != 1 {
		t.Errorf("AssistantMessages = %d, want 1 (deduped)", session.AssistantMessages)
	}
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
