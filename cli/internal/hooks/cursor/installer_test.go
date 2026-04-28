package cursor_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/austinroos/ax/internal/hooks"
	"github.com/austinroos/ax/internal/hooks/cursor"
)

func makeUserCtx(t *testing.T, homeDir string) hooks.InstallContext {
	t.Helper()
	return hooks.InstallContext{
		AxBinary: "/usr/local/bin/ax",
		HomeDir:  homeDir,
		Scope:    hooks.UserScope,
	}
}

func makeRepoCtx(t *testing.T, repoPath string) hooks.InstallContext {
	t.Helper()
	return hooks.InstallContext{
		AxBinary: "/usr/local/bin/ax",
		RepoPath: repoPath,
		Scope:    hooks.RepoScope,
	}
}

func TestInstallUserScope(t *testing.T) {
	home := t.TempDir()
	ctx := makeUserCtx(t, home)
	inst := cursor.New()

	result, err := inst.Install(ctx)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if !result.Created {
		t.Error("expected Created=true on first install")
	}

	expectedPath := filepath.Join(home, ".cursor", "hooks.json")
	if result.Path != expectedPath {
		t.Errorf("Path = %q, want %q", result.Path, expectedPath)
	}
	if _, err := os.Stat(expectedPath); err != nil {
		t.Fatalf("hook file not found at %s: %v", expectedPath, err)
	}

	// Verify JSON shape
	data, _ := os.ReadFile(expectedPath)
	var hf map[string]interface{}
	if err := json.Unmarshal(data, &hf); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if hf["version"].(float64) != 1 {
		t.Errorf("version = %v, want 1", hf["version"])
	}

	if inst.IsInstalled(ctx) == false {
		t.Error("IsInstalled should return true after install")
	}
}

func TestInstallRepoScope(t *testing.T) {
	repo := t.TempDir()
	ctx := makeRepoCtx(t, repo)
	inst := cursor.New()

	result, err := inst.Install(ctx)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if !result.Created {
		t.Error("expected Created=true on first install")
	}

	expectedPath := filepath.Join(repo, ".cursor", "hooks.json")
	if result.Path != expectedPath {
		t.Errorf("Path = %q, want %q", result.Path, expectedPath)
	}
	if _, err := os.Stat(expectedPath); err != nil {
		t.Fatalf("hook file not found at %s: %v", expectedPath, err)
	}
	// Repo scope should have a message about committing the file
	if result.Message == "" {
		t.Error("expected non-empty Message for repo scope install")
	}

	if inst.IsInstalled(ctx) == false {
		t.Error("IsInstalled should return true after install")
	}
}

func TestUninstallRemovesAXEntries(t *testing.T) {
	home := t.TempDir()
	ctx := makeUserCtx(t, home)
	inst := cursor.New()

	if _, err := inst.Install(ctx); err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	if err := inst.Uninstall(ctx); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	if inst.IsInstalled(ctx) {
		t.Error("IsInstalled should return false after uninstall")
	}

	// File should be removed (no non-AX entries to preserve)
	expectedPath := filepath.Join(home, ".cursor", "hooks.json")
	if _, err := os.Stat(expectedPath); !os.IsNotExist(err) {
		t.Error("expected hook file to be removed after uninstall")
	}
}

func TestUninstallPreservesNonAXEntries(t *testing.T) {
	home := t.TempDir()
	cursorDir := filepath.Join(home, ".cursor")
	if err := os.MkdirAll(cursorDir, 0o755); err != nil {
		t.Fatal(err)
	}
	hookPath := filepath.Join(cursorDir, "hooks.json")

	// Write a hook file with both AX and non-AX entries
	foreign := `{"version":1,"hooks":{"sessionEnd":[{"type":"command","command":"some-other-tool --do-thing"},{"type":"command","command":"ax push --repo ."}]}}`
	if err := os.WriteFile(hookPath, []byte(foreign), 0o644); err != nil {
		t.Fatal(err)
	}

	ctx := makeUserCtx(t, home)
	inst := cursor.New()

	if err := inst.Uninstall(ctx); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	// File should still exist with non-AX entry preserved
	if _, err := os.Stat(hookPath); err != nil {
		t.Fatal("expected hook file to still exist after partial uninstall")
	}

	data, _ := os.ReadFile(hookPath)
	if strings.Contains(string(data), "ax push") {
		t.Error("AX entry should have been removed")
	}
	if !strings.Contains(string(data), "some-other-tool") {
		t.Error("non-AX entry should be preserved")
	}
}

func TestIsInstalled_NoFile(t *testing.T) {
	home := t.TempDir()
	ctx := makeUserCtx(t, home)
	inst := cursor.New()

	if inst.IsInstalled(ctx) {
		t.Error("IsInstalled should return false when no file exists")
	}
}

func TestUninstall_NoFile(t *testing.T) {
	home := t.TempDir()
	ctx := makeUserCtx(t, home)
	inst := cursor.New()

	if err := inst.Uninstall(ctx); err != nil {
		t.Errorf("Uninstall with no file should not error: %v", err)
	}
}

func TestCommandContainsAxPush(t *testing.T) {
	home := t.TempDir()
	ctx := makeUserCtx(t, home)
	inst := cursor.New()

	if _, err := inst.Install(ctx); err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	hookPath := filepath.Join(home, ".cursor", "hooks.json")
	data, _ := os.ReadFile(hookPath)

	type hookEntry struct {
		Type    string `json:"type"`
		Command string `json:"command"`
	}
	type hookFile struct {
		Version int                      `json:"version"`
		Hooks   map[string][]hookEntry   `json:"hooks"`
	}

	var hf hookFile
	if err := json.Unmarshal(data, &hf); err != nil {
		t.Fatalf("failed to parse hook file: %v", err)
	}

	entries := hf.Hooks["sessionEnd"]
	if len(entries) != 1 {
		t.Fatalf("expected 1 sessionEnd entry, got %d", len(entries))
	}

	if entries[0].Type != "command" {
		t.Errorf("type = %q, want command", entries[0].Type)
	}
	if !strings.Contains(entries[0].Command, "ax push") {
		t.Errorf("command should contain 'ax push', got: %q", entries[0].Command)
	}
}
