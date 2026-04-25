package bulk

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/austinroos/ax/internal/parsers"
)

func TestResolveWorktreePath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{"regular repo path", "/Users/a/dev/ax", "/Users/a/dev/ax"},
		{"worktree path", "/Users/a/dev/ax/.claude/worktrees/feature", "/Users/a/dev/ax"},
		{"deep worktree path", "/Users/a/dev/ax/.claude/worktrees/deep/nested", "/Users/a/dev/ax"},
		{"no worktree marker", "/Users/a/.claude/projects/foo", "/Users/a/.claude/projects/foo"},
		{"worktree at start is not stripped", "/.claude/worktrees/foo", "/.claude/worktrees/foo"},
		{"empty path", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ResolveWorktreePath(tt.path)
			if got != tt.want {
				t.Errorf("ResolveWorktreePath(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

func TestUniqueProjectPaths(t *testing.T) {
	sessions := map[string][]parsers.HistoryEntry{
		"session1": {
			{Project: "/Users/a/dev/ax", SessionID: "session1"},
			{Project: "/Users/a/dev/ax", SessionID: "session1"}, // dupe
		},
		"session2": {
			{Project: "/Users/a/dev/other", SessionID: "session2"},
		},
		"session3": {
			{Project: "", SessionID: "session3"}, // empty, should be skipped
		},
		"session4": {
			{Project: "/Users/a/dev/ax", SessionID: "session4"}, // dupe across sessions
		},
	}

	got := uniqueProjectPaths(sessions)
	sort.Strings(got)

	want := []string{"/Users/a/dev/ax", "/Users/a/dev/other"}
	sort.Strings(want)

	if len(got) != len(want) {
		t.Fatalf("uniqueProjectPaths() returned %d paths, want %d: %v", len(got), len(want), got)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("uniqueProjectPaths()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestParseGitRemote(t *testing.T) {
	tests := []struct {
		name         string
		remoteURL    string
		wantPlatform string
		wantOwner    string
		wantRepo     string
		wantErr      bool
	}{
		{"github ssh url", "git@github.com:acroos/ax.git", "github", "acroos", "ax", false},
		{"github ssh url no .git", "git@github.com:acroos/ax", "github", "acroos", "ax", false},
		{"github https url", "https://github.com/acroos/ax.git", "github", "acroos", "ax", false},
		{"github https url no .git", "https://github.com/acroos/ax", "github", "acroos", "ax", false},
		{"gitlab ssh url", "git@gitlab.com:mygroup/myproject.git", "gitlab", "mygroup", "myproject", false},
		{"gitlab ssh url no .git", "git@gitlab.com:mygroup/myproject", "gitlab", "mygroup", "myproject", false},
		{"gitlab https url", "https://gitlab.com/mygroup/myproject.git", "gitlab", "mygroup", "myproject", false},
		{"gitlab https url no .git", "https://gitlab.com/mygroup/myproject", "gitlab", "mygroup", "myproject", false},
		{"empty url", "", "", "", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info, err := ParseGitRemote(tt.remoteURL)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ParseGitRemote(%q) expected error, got nil", tt.remoteURL)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseGitRemote(%q) unexpected error: %v", tt.remoteURL, err)
			}
			if info.Platform != tt.wantPlatform {
				t.Errorf("ParseGitRemote(%q).Platform = %q, want %q", tt.remoteURL, info.Platform, tt.wantPlatform)
			}
			if info.Owner != tt.wantOwner || info.Repo != tt.wantRepo {
				t.Errorf("ParseGitRemote(%q) = (%q, %q), want (%q, %q)", tt.remoteURL, info.Owner, info.Repo, tt.wantOwner, tt.wantRepo)
			}
		})
	}
}

func TestDiscoverRepos(t *testing.T) {
	tmpDir := t.TempDir()
	claudeDir := filepath.Join(tmpDir, ".claude")

	// Create history.jsonl with known entries.
	historyDir := claudeDir
	if err := os.MkdirAll(historyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	projectA := filepath.Join(tmpDir, "project-a")
	projectB := filepath.Join(tmpDir, "project-b")
	projectMissing := filepath.Join(tmpDir, "gone")

	// Create project directories.
	for _, d := range []string{projectA, projectB} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// Create session files in ~/.claude/projects/<encoded-path>/.
	createSessionFile := func(projectPath, sessionID string) {
		encoded := strings.ReplaceAll(projectPath, "/", "-")
		dir := filepath.Join(claudeDir, "projects", encoded)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		// Write a minimal JSONL session file.
		f, err := os.Create(filepath.Join(dir, sessionID+".jsonl"))
		if err != nil {
			t.Fatal(err)
		}
		f.Close()
	}

	createSessionFile(projectA, "sess-a1")
	createSessionFile(projectA, "sess-a2")
	createSessionFile(projectB, "sess-b1")

	// Write history.jsonl.
	entries := []parsers.HistoryEntry{
		{Project: projectA, SessionID: "sess-a1", Timestamp: 1000},
		{Project: projectA, SessionID: "sess-a2", Timestamp: 2000},
		{Project: projectB, SessionID: "sess-b1", Timestamp: 3000},
		{Project: projectMissing, SessionID: "sess-gone", Timestamp: 4000},
	}
	writeHistory(t, claudeDir, entries)

	// Stub git remote function.
	stubGitRemote := func(path string) (RemoteInfo, error) {
		switch path {
		case projectA:
			return RemoteInfo{Platform: "github", Owner: "owner", Repo: "repo-a"}, nil
		case projectB:
			return RemoteInfo{Platform: "github", Owner: "owner", Repo: "repo-b"}, nil
		default:
			return RemoteInfo{}, fmt.Errorf("unknown path: %s", path)
		}
	}

	summary, err := DiscoverRepos(claudeDir, stubGitRemote)
	if err != nil {
		t.Fatalf("DiscoverRepos() error: %v", err)
	}

	if len(summary.Repos) != 2 {
		t.Fatalf("expected 2 repos, got %d", len(summary.Repos))
	}

	// Sort repos for deterministic assertions.
	sort.Slice(summary.Repos, func(i, j int) bool {
		return summary.Repos[i].OwnerRepo < summary.Repos[j].OwnerRepo
	})

	repoA := summary.Repos[0]
	if repoA.OwnerRepo != "owner/repo-a" {
		t.Errorf("repos[0].OwnerRepo = %q, want %q", repoA.OwnerRepo, "owner/repo-a")
	}
	if repoA.Platform != "github" {
		t.Errorf("repos[0].Platform = %q, want %q", repoA.Platform, "github")
	}
	if len(repoA.SessionFiles) != 2 {
		t.Errorf("repos[0] has %d sessions, want 2", len(repoA.SessionFiles))
	}

	repoB := summary.Repos[1]
	if repoB.OwnerRepo != "owner/repo-b" {
		t.Errorf("repos[1].OwnerRepo = %q, want %q", repoB.OwnerRepo, "owner/repo-b")
	}
	if len(repoB.SessionFiles) != 1 {
		t.Errorf("repos[1] has %d sessions, want 1", len(repoB.SessionFiles))
	}

	if summary.TotalSessions != 3 {
		t.Errorf("TotalSessions = %d, want 3", summary.TotalSessions)
	}

	// The missing project should be in skipped paths.
	if len(summary.SkippedPaths) != 1 {
		t.Fatalf("expected 1 skipped path, got %d: %v", len(summary.SkippedPaths), summary.SkippedPaths)
	}
	if summary.SkippedPaths[0].Path != projectMissing {
		t.Errorf("skipped path = %q, want %q", summary.SkippedPaths[0].Path, projectMissing)
	}
}

func TestDiscoverRepos_WorktreeDedup(t *testing.T) {
	tmpDir := t.TempDir()
	claudeDir := filepath.Join(tmpDir, ".claude")

	project := filepath.Join(tmpDir, "my-repo")
	worktree := filepath.Join(tmpDir, "my-repo", ".claude", "worktrees", "feature")

	// Create directories.
	for _, d := range []string{project, worktree} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// Create session files for both paths.
	createEncodedSession := func(projectPath, sessionID string) {
		encoded := strings.ReplaceAll(strings.ReplaceAll(projectPath, "/", "-"), ".", "-")
		dir := filepath.Join(claudeDir, "projects", encoded)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		f, err := os.Create(filepath.Join(dir, sessionID+".jsonl"))
		if err != nil {
			t.Fatal(err)
		}
		f.Close()
	}

	createEncodedSession(project, "sess-main")
	createEncodedSession(worktree, "sess-wt")

	// History has both the root and worktree paths.
	entries := []parsers.HistoryEntry{
		{Project: project, SessionID: "sess-main", Timestamp: 1000},
		{Project: worktree, SessionID: "sess-wt", Timestamp: 2000},
	}
	writeHistory(t, claudeDir, entries)

	stubGitRemote := func(path string) (RemoteInfo, error) {
		if path == project {
			return RemoteInfo{Platform: "github", Owner: "owner", Repo: "my-repo"}, nil
		}
		return RemoteInfo{}, fmt.Errorf("unknown path: %s", path)
	}

	summary, err := DiscoverRepos(claudeDir, stubGitRemote)
	if err != nil {
		t.Fatalf("DiscoverRepos() error: %v", err)
	}

	// Both paths should resolve to the same repo.
	if len(summary.Repos) != 1 {
		t.Fatalf("expected 1 repo, got %d", len(summary.Repos))
	}

	repo := summary.Repos[0]
	if repo.OwnerRepo != "owner/my-repo" {
		t.Errorf("OwnerRepo = %q, want %q", repo.OwnerRepo, "owner/my-repo")
	}

	// Should have sessions from both the main project and the worktree.
	if len(repo.SessionFiles) < 2 {
		t.Errorf("expected at least 2 session files, got %d", len(repo.SessionFiles))
	}
}

func TestDiscoverRepos_EmptyHistory(t *testing.T) {
	tmpDir := t.TempDir()
	// No history.jsonl at all.
	summary, err := DiscoverRepos(tmpDir, func(string) (RemoteInfo, error) {
		return RemoteInfo{}, fmt.Errorf("should not be called")
	})
	if err != nil {
		t.Fatalf("DiscoverRepos() error: %v", err)
	}
	if len(summary.Repos) != 0 {
		t.Errorf("expected 0 repos, got %d", len(summary.Repos))
	}
}

// writeHistory creates a history.jsonl file in the given claude dir.
func writeHistory(t *testing.T, claudeDir string, entries []parsers.HistoryEntry) {
	t.Helper()
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(filepath.Join(claudeDir, "history.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	for _, e := range entries {
		if err := enc.Encode(e); err != nil {
			t.Fatal(err)
		}
	}
}
