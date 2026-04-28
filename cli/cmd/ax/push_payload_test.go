package main

// push_payload_test.go — golden-fixture integration test for push payload output.
//
// This test asserts that the discovery + parse pipeline produces stable output for
// both Claude and Copilot sessions. It skips the HTTP call and snapshots only the
// resulting []api.SessionData (the payload's Sessions slice). Any regression in
// parser output causes this test to fail, proving behavior preservation across the
// Phase 3 provider refactor.
//
// The test uses t.Setenv("AX_CLAUDE_HOME", ...) and t.Setenv("COPILOT_HOME", ...)
// to redirect discovery to temp directories containing fixture files.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"testing"

	_ "github.com/austinroos/ax/internal/agentinit"
	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/parsers"
)

// buildSessionsFromFixtures runs the discovery + parse pipeline for all registered
// providers, returning the resulting []api.SessionData sorted by agent_type then id.
//
// claudeDir must contain a projects/<encoded-path>/<session>.jsonl layout.
// copilotDir must contain a session-state/<uuid>/events.jsonl + workspace.yaml layout.
// cursorDir must contain a projects/<encoded-path>/agent-transcripts/<uuid>/<uuid>.jsonl layout.
// projectPath is the local repo path used to compute the encoded project dir name.
// ownerRepo is the "owner/repo" string Copilot sessions must declare in workspace.yaml.
func buildSessionsFromFixtures(t *testing.T, claudeDir, copilotDir, cursorDir, projectPath, ownerRepo string) []api.SessionData {
	t.Helper()

	t.Setenv("AX_CLAUDE_HOME", claudeDir)
	t.Setenv("COPILOT_HOME", copilotDir)
	t.Setenv("CURSOR_HOME", cursorDir)

	target := agents.DiscoveryTarget{
		OwnerRepo: ownerRepo,
		LocalPath: projectPath,
	}

	var sessions []api.SessionData
	for _, p := range agents.RegisteredProviders() {
		if !p.HomeExists() {
			continue
		}
		locs, err := p.DiscoverSessions(target)
		if err != nil {
			t.Fatalf("%s discover: %v", p.ID(), err)
		}
		for _, loc := range locs {
			sess, err := p.Parse(loc)
			if err != nil {
				t.Fatalf("%s parse %s: %v", p.ID(), loc.SessionID, err)
			}
			caps := parsers.CapsFromFields(p.Capabilities().Fields)
			sessions = append(sessions, sess.ToSessionData(caps))
		}
	}

	sort.Slice(sessions, func(i, j int) bool {
		if sessions[i].AgentType != sessions[j].AgentType {
			return sessions[i].AgentType < sessions[j].AgentType
		}
		return sessions[i].ID < sessions[j].ID
	})

	return sessions
}

// setupClaudeFixture creates a temp ~/.claude with a project dir containing the
// normal_session.jsonl fixture.
func setupClaudeFixture(t *testing.T) (claudeDir, projectPath string) {
	t.Helper()
	claudeDir = t.TempDir()
	projectPath = "/test/myrepo"
	encodedPath := "-test-myrepo"

	projDir := filepath.Join(claudeDir, "projects", encodedPath)
	if err := os.MkdirAll(projDir, 0o755); err != nil {
		t.Fatal(err)
	}

	fixtureData, err := os.ReadFile(filepath.Join("testdata", "fixture_claude_session.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projDir, "aabbccdd-1111-2222-3333-aabbccddee00.jsonl"), fixtureData, 0o644); err != nil {
		t.Fatal(err)
	}
	return claudeDir, projectPath
}

// setupCopilotFixture creates a temp ~/.copilot with a session-state/<uuid>/ dir
// containing events.jsonl and workspace.yaml.
func setupCopilotFixture(t *testing.T, ownerRepo string) string {
	t.Helper()
	copilotDir := t.TempDir()
	sessionUUID := "bbccddee-aaaa-bbbb-cccc-001122334455"
	sessionDir := filepath.Join(copilotDir, "session-state", sessionUUID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatal(err)
	}

	workspaceData, err := os.ReadFile(filepath.Join("testdata", "fixture_copilot_workspace.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, "workspace.yaml"), workspaceData, 0o644); err != nil {
		t.Fatal(err)
	}

	eventsData, err := os.ReadFile(filepath.Join("testdata", "fixture_copilot_events.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, "events.jsonl"), eventsData, 0o644); err != nil {
		t.Fatal(err)
	}
	return copilotDir
}

func TestPushPayloadGoldenClaude(t *testing.T) {
	claudeDir, projectPath := setupClaudeFixture(t)
	ownerRepo := "testorg/myrepo"

	sessions := buildSessionsFromFixtures(t, claudeDir, t.TempDir(), t.TempDir(), projectPath, ownerRepo)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 Claude session, got %d", len(sessions))
	}

	got, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	snapshotPath := filepath.Join("testdata", "expected_payload_claude.json")
	if _, err := os.Stat(snapshotPath); os.IsNotExist(err) {
		if err := os.WriteFile(snapshotPath, got, 0o644); err != nil {
			t.Fatalf("write snapshot: %v", err)
		}
		t.Logf("wrote initial snapshot to %s", snapshotPath)
		return
	}

	want, err := os.ReadFile(snapshotPath)
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}

	if string(got) != string(want) {
		t.Errorf("Claude payload mismatch.\ngot:\n%s\nwant:\n%s", got, want)
	}
}

func TestPushPayloadGoldenCopilot(t *testing.T) {
	ownerRepo := "testorg/myrepo"
	copilotDir := setupCopilotFixture(t, ownerRepo)

	sessions := buildSessionsFromFixtures(t, t.TempDir(), copilotDir, t.TempDir(), "/test/myrepo", ownerRepo)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 Copilot session, got %d", len(sessions))
	}

	got, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	snapshotPath := filepath.Join("testdata", "expected_payload_copilot.json")
	if _, err := os.Stat(snapshotPath); os.IsNotExist(err) {
		if err := os.WriteFile(snapshotPath, got, 0o644); err != nil {
			t.Fatalf("write snapshot: %v", err)
		}
		t.Logf("wrote initial snapshot to %s", snapshotPath)
		return
	}

	want, err := os.ReadFile(snapshotPath)
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}

	if string(got) != string(want) {
		t.Errorf("Copilot payload mismatch.\ngot:\n%s\nwant:\n%s", got, want)
	}
}

// setupCursorFixture creates a temp ~/.cursor with a project dir containing the
// fixture_cursor_transcript.jsonl fixture under agent-transcripts/<uuid>/<uuid>.jsonl.
func setupCursorFixture(t *testing.T) (cursorDir, projectPath string) {
	t.Helper()
	cursorDir = t.TempDir()
	projectPath = "/test/myrepo"
	// Cursor encodes path by stripping leading "/" and replacing "/" with "-".
	encodedPath := "test-myrepo"
	agentUUID := "ccddee11-aaaa-bbbb-cccc-001122334455"

	transcriptDir := filepath.Join(cursorDir, "projects", encodedPath, "agent-transcripts", agentUUID)
	if err := os.MkdirAll(transcriptDir, 0o755); err != nil {
		t.Fatal(err)
	}

	fixtureData, err := os.ReadFile(filepath.Join("testdata", "fixture_cursor_transcript.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(transcriptDir, agentUUID+".jsonl"), fixtureData, 0o644); err != nil {
		t.Fatal(err)
	}
	return cursorDir, projectPath
}

func TestPushPayloadGoldenCursor(t *testing.T) {
	cursorDir, projectPath := setupCursorFixture(t)
	ownerRepo := "testorg/myrepo"

	sessions := buildSessionsFromFixtures(t, t.TempDir(), t.TempDir(), cursorDir, projectPath, ownerRepo)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 Cursor session, got %d", len(sessions))
	}

	got, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	snapshotPath := filepath.Join("testdata", "expected_payload_cursor.json")
	if _, err := os.Stat(snapshotPath); os.IsNotExist(err) {
		if err := os.WriteFile(snapshotPath, got, 0o644); err != nil {
			t.Fatalf("write snapshot: %v", err)
		}
		t.Logf("wrote initial snapshot to %s", snapshotPath)
		return
	}

	want, err := os.ReadFile(snapshotPath)
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}

	if string(got) != string(want) {
		t.Errorf("Cursor payload mismatch.\ngot:\n%s\nwant:\n%s", got, want)
	}
}
