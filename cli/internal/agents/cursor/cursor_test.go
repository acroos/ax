package cursor

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/agents"
)

// --- Parser tests ---

func TestParseTranscript(t *testing.T) {
	sess, err := parseTranscript(filepath.Join("testdata", "transcript.jsonl"), "test-session")
	if err != nil {
		t.Fatalf("parseTranscript failed: %v", err)
	}

	if sess.HumanMessages != 1 {
		t.Errorf("HumanMessages = %d, want 1", sess.HumanMessages)
	}
	if sess.AssistantMessages != 1 {
		t.Errorf("AssistantMessages = %d, want 1", sess.AssistantMessages)
	}
	if sess.TurnCount != 1 {
		t.Errorf("TurnCount = %d, want 1", sess.TurnCount)
	}
	if len(sess.FilesRead) != 1 || sess.FilesRead[0] != "/Users/test/dev/ax/README.md" {
		t.Errorf("FilesRead = %v, want [/Users/test/dev/ax/README.md]", sess.FilesRead)
	}
	if len(sess.FilesModified) != 1 || sess.FilesModified[0] != "/Users/test/dev/ax/README.md" {
		t.Errorf("FilesModified = %v, want [/Users/test/dev/ax/README.md]", sess.FilesModified)
	}
	if sess.ToolCalls["ReadFile"] != 1 {
		t.Errorf("ToolCalls[ReadFile] = %d, want 1", sess.ToolCalls["ReadFile"])
	}
	if sess.ToolCalls["ApplyPatch"] != 1 {
		t.Errorf("ToolCalls[ApplyPatch] = %d, want 1", sess.ToolCalls["ApplyPatch"])
	}
	if sess.ToolCalls["Shell"] != 1 {
		t.Errorf("ToolCalls[Shell] = %d, want 1", sess.ToolCalls["Shell"])
	}
	if sess.TotalFileReads != 1 {
		t.Errorf("TotalFileReads = %d, want 1", sess.TotalFileReads)
	}
	// TotalToolCalls = ReadFile + ApplyPatch + Shell
	if sess.TotalToolCalls != 3 {
		t.Errorf("TotalToolCalls = %d, want 3", sess.TotalToolCalls)
	}
	// Timestamp from the user message: 2026-04-01T10:00:00Z → 1743498000000 ms
	if sess.StartedAt == 0 {
		t.Error("StartedAt should be non-zero (parsed from embedded timestamp)")
	}
	if sess.EndedAt == 0 {
		t.Error("EndedAt should be non-zero")
	}
}

func TestExtractFirstTimestamp(t *testing.T) {
	tests := []struct {
		name    string
		text    string
		wantMS  int64
		wantNon bool // true = expect non-zero
	}{
		{
			name:    "valid RFC3339",
			text:    "<timestamp>2026-04-01T10:00:00Z</timestamp>\nsome query",
			wantNon: true,
		},
		{
			name:    "no timestamp",
			text:    "just some plain text",
			wantNon: false,
		},
		{
			name:    "malformed timestamp",
			text:    "<timestamp>not-a-date</timestamp>",
			wantNon: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractFirstTimestamp(tt.text)
			if tt.wantNon && got == 0 {
				t.Error("expected non-zero timestamp, got 0")
			}
			if !tt.wantNon && got != 0 {
				t.Errorf("expected zero timestamp, got %d", got)
			}
		})
	}
}

// --- ApplyPatch tests ---

func TestParseApplyPatch(t *testing.T) {
	patch := `*** Begin Patch
*** Update File: /path/to/updated.go
@@ -1,3 +1,3 @@
 context
-old line
+new line
 context
*** Add File: /path/to/new.go
+brand new file content
*** Delete File: /path/to/removed.go
*** End Patch`

	paths := ParseApplyPatch(patch)
	if len(paths) != 3 {
		t.Fatalf("expected 3 paths, got %d: %v", len(paths), paths)
	}
	want := []string{"/path/to/updated.go", "/path/to/new.go", "/path/to/removed.go"}
	for i, w := range want {
		if paths[i] != w {
			t.Errorf("paths[%d] = %q, want %q", i, paths[i], w)
		}
	}
}

func TestParseApplyPatch_Empty(t *testing.T) {
	paths := ParseApplyPatch("")
	if paths != nil {
		t.Errorf("expected nil for empty patch, got %v", paths)
	}
}

func TestParseApplyPatch_NoMarkers(t *testing.T) {
	paths := ParseApplyPatch("*** Begin Patch\n@@ -1 +1 @@\nsome diff\n*** End Patch")
	if paths != nil {
		t.Errorf("expected nil when no file markers, got %v", paths)
	}
}

// --- Provider tests ---

func TestProviderID(t *testing.T) {
	p := New()
	if p.ID() != agents.CursorCli {
		t.Errorf("ID() = %q, want %q", p.ID(), agents.CursorCli)
	}
}

func TestProviderHomeExistsRespectsCURSOR_HOME(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CURSOR_HOME", dir)

	p := New()
	if !p.HomeExists() {
		t.Error("HomeExists() should return true when CURSOR_HOME points to existing dir")
	}
	if p.HomeDir() != dir {
		t.Errorf("HomeDir() = %q, want %q", p.HomeDir(), dir)
	}
}

func TestProviderHomeExistsReturnsFalseForMissing(t *testing.T) {
	t.Setenv("CURSOR_HOME", "/this/path/definitely/does/not/exist-ax-test")
	p := New()
	if p.HomeExists() {
		t.Error("HomeExists() should return false when CURSOR_HOME dir doesn't exist")
	}
}

func TestProviderDiscoverSessionsFindsTranscripts(t *testing.T) {
	// Set up a temp dir that mimics ~/.cursor/projects/<encoded>/agent-transcripts/<uuid>/<uuid>.jsonl
	cursorHome := t.TempDir()
	t.Setenv("CURSOR_HOME", cursorHome)

	// The project path we'll encode: /tmp/myproject
	projectPath := "/tmp/myproject"
	encoded := encodePath(projectPath) // "tmp-myproject"

	agentUUID := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	transcriptDir := filepath.Join(cursorHome, "projects", encoded, "agent-transcripts", agentUUID)
	if err := os.MkdirAll(transcriptDir, 0o755); err != nil {
		t.Fatal(err)
	}
	transcriptFile := filepath.Join(transcriptDir, agentUUID+".jsonl")
	if err := os.WriteFile(transcriptFile, []byte(`{"role":"user","message":{"content":[]}}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	p := New()
	locs, err := p.DiscoverSessions(agents.DiscoveryTarget{LocalPath: projectPath})
	if err != nil {
		t.Fatalf("DiscoverSessions failed: %v", err)
	}
	if len(locs) != 1 {
		t.Fatalf("expected 1 session, got %d", len(locs))
	}
	if locs[0].SessionID != agentUUID {
		t.Errorf("SessionID = %q, want %q", locs[0].SessionID, agentUUID)
	}
	if locs[0].Path != transcriptFile {
		t.Errorf("Path = %q, want %q", locs[0].Path, transcriptFile)
	}
}

func TestProviderDiscoverSessionsNoLocalPath(t *testing.T) {
	p := New()
	locs, err := p.DiscoverSessions(agents.DiscoveryTarget{OwnerRepo: "owner/repo"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if locs != nil {
		t.Errorf("expected nil when LocalPath is empty, got %v", locs)
	}
}

func TestProviderParseSetsAgentType(t *testing.T) {
	p := New()
	loc := agents.SessionLocator{
		AgentID:   agents.CursorCli,
		SessionID: "test-session",
		Path:      filepath.Join("testdata", "transcript.jsonl"),
		OwnerRepo: "owner/repo",
	}
	sess, err := p.Parse(loc)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if sess.AgentType != "cursor_cli" {
		t.Errorf("AgentType = %q, want cursor_cli", sess.AgentType)
	}
}

func TestProviderDiscoverAllReposReadsWorkspaceTrusted(t *testing.T) {
	cursorHome := t.TempDir()
	t.Setenv("CURSOR_HOME", cursorHome)

	// Project 1: has .workspace-trusted with workspacePath
	proj1Dir := filepath.Join(cursorHome, "projects", "Users-test-dev-myproject")
	if err := os.MkdirAll(proj1Dir, 0o755); err != nil {
		t.Fatal(err)
	}
	wsContent := `{"workspacePath":"/Users/test/dev/myproject","trustedAt":"2026-04-01T10:00:00Z"}`
	if err := os.WriteFile(filepath.Join(proj1Dir, ".workspace-trusted"), []byte(wsContent), 0o644); err != nil {
		t.Fatal(err)
	}

	// Project 2: no .workspace-trusted — falls back to decoded dir name
	proj2Dir := filepath.Join(cursorHome, "projects", "tmp-otherproject")
	if err := os.MkdirAll(proj2Dir, 0o755); err != nil {
		t.Fatal(err)
	}

	p := New()
	repos, err := p.DiscoverAllRepos()
	if err != nil {
		t.Fatalf("DiscoverAllRepos failed: %v", err)
	}
	if len(repos) != 2 {
		t.Fatalf("expected 2 repos, got %d: %v", len(repos), repos)
	}

	// Find the one with .workspace-trusted
	var wsPathFound, decodedFound bool
	for _, r := range repos {
		if r.LocalPath == "/Users/test/dev/myproject" {
			wsPathFound = true
		}
		if r.LocalPath == "/tmp/otherproject" {
			decodedFound = true
		}
	}
	if !wsPathFound {
		t.Errorf("expected /Users/test/dev/myproject from .workspace-trusted, got repos: %v", repos)
	}
	if !decodedFound {
		t.Errorf("expected /tmp/otherproject from decoded dir name, got repos: %v", repos)
	}
}

// --- Path encoding tests ---

func TestEncodePath(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"/Users/foo/dev/ax", "Users-foo-dev-ax"},
		{"/tmp/myproject", "tmp-myproject"},
		// Dots are PRESERVED (unlike Claude which replaces them with -)
		{"/Users/foo/.config/myproj", "Users-foo-.config-myproj"},
		// Single component
		{"/tmp", "tmp"},
	}

	for _, tt := range tests {
		got := encodePath(tt.input)
		if got != tt.want {
			t.Errorf("encodePath(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
