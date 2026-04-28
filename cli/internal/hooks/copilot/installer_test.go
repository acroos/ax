package copilot_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/hooks"
	"github.com/austinroos/ax/internal/hooks/copilot"
)

func initGitRepo(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatalf("failed to create .git dir: %v", err)
	}
}

func makeCtx(t *testing.T, repoPath string) hooks.InstallContext {
	t.Helper()
	return hooks.InstallContext{
		AxBinary: "/usr/local/bin/ax",
		RepoPath: repoPath,
		Scope:    hooks.RepoScope,
	}
}

func TestInstallAndUninstall(t *testing.T) {
	dir := t.TempDir()
	initGitRepo(t, dir)
	ctx := makeCtx(t, dir)
	inst := copilot.New()

	result, err := inst.Install(ctx)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if !result.Created {
		t.Error("Expected Created=true on first install")
	}

	hookPath := filepath.Join(dir, ".github", "hooks", "session-end.json")
	if _, err := os.Stat(hookPath); err != nil {
		t.Fatalf("Expected hook file at %s: %v", hookPath, err)
	}

	data, _ := os.ReadFile(hookPath)
	var hookFile map[string]interface{}
	if err := json.Unmarshal(data, &hookFile); err != nil {
		t.Fatalf("Failed to parse hook file: %v", err)
	}

	if inst.IsInstalled(ctx) == false {
		t.Error("Expected IsInstalled to return true after install")
	}

	if err := inst.Uninstall(ctx); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	if inst.IsInstalled(ctx) {
		t.Error("Expected IsInstalled to return false after uninstall")
	}

	if _, err := os.Stat(hookPath); !os.IsNotExist(err) {
		t.Error("Expected hook file to be removed after uninstall")
	}
}

func TestInstall_NotAGitRepo(t *testing.T) {
	dir := t.TempDir()
	ctx := makeCtx(t, dir)
	inst := copilot.New()

	result, err := inst.Install(ctx)
	if err != nil {
		t.Fatalf("Install should not error on non-git dir: %v", err)
	}
	if result.Created {
		t.Error("Expected no install in non-git directory")
	}

	hookPath := filepath.Join(dir, ".github", "hooks", "session-end.json")
	if _, err := os.Stat(hookPath); !os.IsNotExist(err) {
		t.Error("Expected no hook file created in non-git directory")
	}
}

func TestInstall_CommandIsPushRepoForm(t *testing.T) {
	dir := t.TempDir()
	initGitRepo(t, dir)
	ctx := makeCtx(t, dir)
	inst := copilot.New()

	if _, err := inst.Install(ctx); err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	hookPath := filepath.Join(dir, ".github", "hooks", "session-end.json")
	data, _ := os.ReadFile(hookPath)

	type hookEntry struct {
		Type       string `json:"type"`
		Bash       string `json:"bash"`
		TimeoutSec int    `json:"timeoutSec"`
	}
	type hookFile struct {
		Version int                        `json:"version"`
		Hooks   map[string][]hookEntry     `json:"hooks"`
	}

	var hf hookFile
	if err := json.Unmarshal(data, &hf); err != nil {
		t.Fatalf("Failed to parse hook file: %v", err)
	}

	entries := hf.Hooks["sessionEnd"]
	if len(entries) != 1 {
		t.Fatalf("Expected 1 sessionEnd entry, got %d", len(entries))
	}

	entry := entries[0]
	if entry.Bash != "ax push --repo ." {
		t.Errorf("expected simple 'ax push --repo .' command, got %q", entry.Bash)
	}
	if entry.Type != "command" {
		t.Errorf("expected type 'command', got %q", entry.Type)
	}
}

func TestIsInstalled_NoFile(t *testing.T) {
	dir := t.TempDir()
	ctx := makeCtx(t, dir)
	inst := copilot.New()

	if inst.IsInstalled(ctx) {
		t.Error("Expected false when no hook file exists")
	}
}

func TestUninstall_NoFile(t *testing.T) {
	dir := t.TempDir()
	ctx := makeCtx(t, dir)
	inst := copilot.New()

	if err := inst.Uninstall(ctx); err != nil {
		t.Errorf("Uninstall with no file should not error: %v", err)
	}
}

func TestUninstall_NotAXOwned(t *testing.T) {
	dir := t.TempDir()
	initGitRepo(t, dir)
	ctx := makeCtx(t, dir)
	inst := copilot.New()

	hookPath := filepath.Join(dir, ".github", "hooks", "session-end.json")
	os.MkdirAll(filepath.Dir(hookPath), 0o755) //nolint:errcheck

	foreign := `{"version":1,"hooks":{"sessionEnd":[{"type":"command","bash":"some-other-tool","timeoutSec":10}]}}`
	os.WriteFile(hookPath, []byte(foreign), 0o644) //nolint:errcheck

	if err := inst.Uninstall(ctx); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	if _, err := os.Stat(hookPath); err != nil {
		t.Error("Expected foreign hook file to be preserved (not deleted)")
	}
}

func TestInstall_Install_ReturnsPath(t *testing.T) {
	dir := t.TempDir()
	initGitRepo(t, dir)
	ctx := makeCtx(t, dir)
	inst := copilot.New()

	result, err := inst.Install(ctx)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	expectedPath := filepath.Join(dir, ".github", "hooks", "session-end.json")
	if result.Path != expectedPath {
		t.Errorf("expected Path %q, got %q", expectedPath, result.Path)
	}
}
