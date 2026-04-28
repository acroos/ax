package copilot

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/parsers"
)

func TestProviderID(t *testing.T) {
	p := New()
	if p.ID() != agents.CopilotCli {
		t.Errorf("ID() = %q, want %q", p.ID(), agents.CopilotCli)
	}
}

func TestProviderDiscoverSessionsWithoutOwnerRepoReturnsNil(t *testing.T) {
	p := New()
	locs, err := p.DiscoverSessions(agents.DiscoveryTarget{LocalPath: "/tmp/repo"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if locs != nil {
		t.Errorf("expected nil locators when OwnerRepo is empty, got %v", locs)
	}
}

func TestProviderParseSetsAgentType(t *testing.T) {
	dir := t.TempDir()
	workspace := `id: "test-session-1"
cwd: "/tmp/repo"
git_root: "/tmp/repo"
repository: "owner/repo"
branch: "main"
`
	if err := os.WriteFile(filepath.Join(dir, "workspace.yaml"), []byte(workspace), 0o644); err != nil {
		t.Fatalf("write workspace.yaml: %v", err)
	}
	events := `{"type":"session.shutdown","timestamp":"2026-04-01T10:01:00Z","data":{"modelMetrics":[]}}
`
	if err := os.WriteFile(filepath.Join(dir, "events.jsonl"), []byte(events), 0o644); err != nil {
		t.Fatalf("write events.jsonl: %v", err)
	}

	p := New()
	loc := agents.SessionLocator{
		AgentID:   agents.CopilotCli,
		SessionID: "test-session-1",
		Path:      dir,
		OwnerRepo: "owner/repo",
	}
	sess, err := p.Parse(loc)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if sess.AgentType != "copilot_cli" {
		t.Errorf("AgentType = %q, want copilot_cli", sess.AgentType)
	}
}

func TestParseCopilotSession(t *testing.T) {
	dir := t.TempDir()
	workspace := `id: "workspace-1"
cwd: "/tmp/repo"
git_root: "/tmp/repo"
repository: "owner/repo"
branch: "feature/copilot"
`
	if err := os.WriteFile(filepath.Join(dir, "workspace.yaml"), []byte(workspace), 0o644); err != nil {
		t.Fatalf("write workspace.yaml: %v", err)
	}

	events := `{"type":"session.start","timestamp":"2026-04-01T10:00:00Z","data":{"context":{"cwd":"/tmp/repo","gitRoot":"/tmp/repo","branch":"feature/copilot","repository":"owner/repo"}}}
{"type":"session.model_change","timestamp":"2026-04-01T10:00:01Z","data":{"newModel":"gpt-5.4"}}
{"type":"user.message","timestamp":"2026-04-01T10:00:02Z","data":{"message":"hello"}}
{"type":"assistant.turn_start","timestamp":"2026-04-01T10:00:03Z","data":{}}
{"type":"assistant.message","timestamp":"2026-04-01T10:00:04Z","data":{"model":"gpt-5.4","toolRequests":[{"id":"tool-1","toolName":"shell"},{"id":"tool-2","toolName":"edit_file"},{"id":"tool-3","toolName":"read_file"},{"id":"tool-4","toolName":"bash"}]}}
{"type":"tool.execution_start","timestamp":"2026-04-01T10:00:05Z","data":{"toolName":"shell","arguments":{"command":"gh pr create"},"toolRequestId":"tool-1"}}
{"type":"tool.execution_start","timestamp":"2026-04-01T10:00:06Z","data":{"toolName":"edit_file","arguments":{"file_path":"README.md"},"toolRequestId":"tool-2"}}
{"type":"tool.execution_start","timestamp":"2026-04-01T10:00:07Z","data":{"toolName":"read_file","arguments":{"path":"README.md"},"toolRequestId":"tool-3"}}
{"type":"tool.execution_start","timestamp":"2026-04-01T10:00:08Z","data":{"toolName":"bash","arguments":{"command":"git commit -m test"},"toolRequestId":"tool-4"}}
{"type":"tool.execution_complete","timestamp":"2026-04-01T10:00:08Z","data":{"toolRequestId":"tool-1","result":{"content":"https://github.com/owner/repo/pull/123 abcdef1234567890abcdef1234567890abcdef12"}}}
{"type":"tool.execution_complete","timestamp":"2026-04-01T10:00:09Z","data":{"toolRequestId":"tool-4","result":{"content":"[main abcdef1234567890abcdef1234567890abcdef12] test"}}}
{"type":"session.shutdown","timestamp":"2026-04-01T10:01:00Z","data":{"modelMetrics":[{"model":"gpt-5.4","usage":{"inputTokens":1000,"outputTokens":250,"cacheReadTokens":100,"cacheWriteTokens":50,"reasoningTokens":25}}]}}
`
	if err := os.WriteFile(filepath.Join(dir, "events.jsonl"), []byte(events), 0o644); err != nil {
		t.Fatalf("write events.jsonl: %v", err)
	}

	session, err := parseSession(dir)
	if err != nil {
		t.Fatalf("parseSession returned error: %v", err)
	}

	if session.AgentType != "copilot_cli" {
		t.Errorf("AgentType = %q, want copilot_cli", session.AgentType)
	}
	if session.Branch != "feature/copilot" {
		t.Errorf("Branch = %q, want feature/copilot", session.Branch)
	}
	if session.InputTokens != 1000 || session.OutputTokens != 250 {
		t.Errorf("tokens = %d/%d, want 1000/250", session.InputTokens, session.OutputTokens)
	}
	if session.CacheReadInputTokens != 100 || session.CacheCreationInputTokens != 50 {
		t.Errorf("cache tokens = %d/%d, want 100/50", session.CacheReadInputTokens, session.CacheCreationInputTokens)
	}
	if session.HumanMessages != 1 || session.TurnCount != 1 || session.AssistantMessages != 1 {
		t.Errorf("counts = human %d turns %d assistant %d, want 1/1/1", session.HumanMessages, session.TurnCount, session.AssistantMessages)
	}
	if session.TotalToolCalls != 4 || session.TotalFileReads != 1 || len(session.FilesModified) != 1 {
		t.Errorf("tool/file counts = tools %d reads %d modified %d, want 4/1/1", session.TotalToolCalls, session.TotalFileReads, len(session.FilesModified))
	}
	sd := session.ToSessionData(parsers.DefaultCaps(session.AgentType))
	if sd.SidechainMessages != nil {
		t.Fatalf("SidechainMessages = %d, want nil for Copilot CLI", *sd.SidechainMessages)
	}
	if sd.PeakContextPct != nil {
		t.Fatalf("PeakContextPct = %f, want nil for Copilot CLI", *sd.PeakContextPct)
	}

	if len(session.PRURLs) != 1 || session.PRURLs[0] != "https://github.com/owner/repo/pull/123" {
		t.Fatalf("PRURLs = %#v, want PR URL", session.PRURLs)
	}
	if len(session.CommitSHAs) != 1 || session.CommitSHAs[0] != "abcdef1234567890abcdef1234567890abcdef12" {
		t.Fatalf("CommitSHAs = %#v, want parsed SHA", session.CommitSHAs)
	}
}

func TestDiscoverAllRepos(t *testing.T) {
	copilotDir := t.TempDir()

	for _, sessionID := range []string{"sess-aaa", "sess-bbb"} {
		dir := filepath.Join(copilotDir, "session-state", sessionID)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		workspace := `repository: "owner/repo"
git_root: "/tmp/repo"
`
		if err := os.WriteFile(filepath.Join(dir, "workspace.yaml"), []byte(workspace), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "events.jsonl"), []byte("{}"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	// Second repo
	dir2 := filepath.Join(copilotDir, "session-state", "sess-ccc")
	if err := os.MkdirAll(dir2, 0o755); err != nil {
		t.Fatal(err)
	}
	workspace2 := `repository: "other/repo"
git_root: "/tmp/other"
`
	if err := os.WriteFile(filepath.Join(dir2, "workspace.yaml"), []byte(workspace2), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir2, "events.jsonl"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("COPILOT_HOME", copilotDir)
	p := New()
	repos, err := p.DiscoverAllRepos()
	if err != nil {
		t.Fatalf("DiscoverAllRepos: %v", err)
	}

	if len(repos) != 2 {
		t.Fatalf("expected 2 repos, got %d: %v", len(repos), repos)
	}
}
