package state

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMissing(t *testing.T) {
	// Override home so state looks in a temp dir
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	s, err := Load("owner/repo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(s.PushedSessionIDs) != 0 {
		t.Errorf("expected empty state, got %d IDs", len(s.PushedSessionIDs))
	}
}

func TestSaveAndLoad(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	s := &RepoState{
		PushedSessionIDs: []string{"session-1", "session-2", "session-3"},
	}

	if err := Save("owner/repo", s); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Verify file was created at expected path
	expectedPath := filepath.Join(tmp, ".ax", "state", "owner-repo.json")
	if _, err := os.Stat(expectedPath); err != nil {
		t.Fatalf("state file not created at %s: %v", expectedPath, err)
	}

	loaded, err := Load("owner/repo")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if len(loaded.PushedSessionIDs) != 3 {
		t.Fatalf("expected 3 IDs, got %d", len(loaded.PushedSessionIDs))
	}
	set := loaded.PushedSet()
	for _, id := range []string{"session-1", "session-2", "session-3"} {
		if !set[id] {
			t.Errorf("missing session ID %q", id)
		}
	}
}

func TestAddPushed(t *testing.T) {
	s := &RepoState{
		PushedSessionIDs: []string{"session-1"},
	}

	// Add new and duplicate
	s.AddPushed([]string{"session-1", "session-2", "session-3"})

	if len(s.PushedSessionIDs) != 3 {
		t.Fatalf("expected 3 IDs after AddPushed, got %d", len(s.PushedSessionIDs))
	}
}

func TestSessionIDFromPath(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"/home/user/.claude/projects/foo/abc-123.jsonl", "abc-123"},
		{"session.jsonl", "session"},
		{"/path/to/uuid-like-id.jsonl", "uuid-like-id"},
	}

	for _, tt := range tests {
		got := SessionIDFromPath(tt.path)
		if got != tt.want {
			t.Errorf("SessionIDFromPath(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestFilterNewSessionFiles(t *testing.T) {
	files := []string{
		"/path/session-1.jsonl",
		"/path/session-2.jsonl",
		"/path/session-3.jsonl",
		"/path/session-4.jsonl",
	}

	pushed := map[string]bool{
		"session-1": true,
		"session-3": true,
	}

	newFiles := FilterNewSessionFiles(files, pushed)

	if len(newFiles) != 2 {
		t.Fatalf("expected 2 new files, got %d", len(newFiles))
	}

	// Should contain session-2 and session-4
	ids := make(map[string]bool)
	for _, f := range newFiles {
		ids[SessionIDFromPath(f)] = true
	}
	if !ids["session-2"] || !ids["session-4"] {
		t.Errorf("unexpected filtered files: %v", newFiles)
	}
}

func TestFilterNewSessionFilesEmptyPushed(t *testing.T) {
	files := []string{"/path/a.jsonl", "/path/b.jsonl"}
	newFiles := FilterNewSessionFiles(files, nil)

	if len(newFiles) != 2 {
		t.Errorf("expected all files returned when pushed is empty, got %d", len(newFiles))
	}
}

func TestFilterNewSessionFilesAllPushed(t *testing.T) {
	files := []string{"/path/a.jsonl", "/path/b.jsonl"}
	pushed := map[string]bool{"a": true, "b": true}

	newFiles := FilterNewSessionFiles(files, pushed)

	if len(newFiles) != 0 {
		t.Errorf("expected 0 new files when all pushed, got %d", len(newFiles))
	}
}
