package claude_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/hooks"
	"github.com/austinroos/ax/internal/hooks/claude"
)

// makeCtx builds an InstallContext for tests using a temp home dir.
func makeCtx(t *testing.T, homeDir string) hooks.InstallContext {
	t.Helper()
	return hooks.InstallContext{
		AxBinary: "/usr/local/bin/ax",
		HomeDir:  homeDir,
		Scope:    hooks.UserScope,
	}
}

func TestInstallAndUninstall(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	if _, err := inst.Install(ctx); err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("Failed to read settings: %v", err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("Failed to parse settings: %v", err)
	}

	hooksMap, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected hooks key in settings")
	}

	sessionEnd, ok := hooksMap["SessionEnd"].([]interface{})
	if !ok {
		t.Fatal("Expected SessionEnd array in hooks")
	}

	if len(sessionEnd) != 1 {
		t.Fatalf("Expected 1 SessionEnd hook, got %d", len(sessionEnd))
	}

	if !inst.IsInstalled(ctx) {
		t.Error("Expected IsInstalled to return true")
	}

	if err := inst.Uninstall(ctx); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	if inst.IsInstalled(ctx) {
		t.Error("Expected IsInstalled to return false after uninstall")
	}
}

func TestInstall_ReturnsInstalledWithPath(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	result, err := inst.Install(ctx)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	expectedPath := filepath.Join(home, ".claude", "settings.json")
	if result.Path != expectedPath {
		t.Errorf("expected Path %q, got %q", expectedPath, result.Path)
	}
}

func TestInstallPreservesExistingSettings(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatal(err)
	}

	existing := `{
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true
  }
}
`
	os.WriteFile(settingsPath, []byte(existing), 0o644) //nolint:errcheck

	if _, err := inst.Install(ctx); err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings) //nolint:errcheck

	plugins, ok := settings["enabledPlugins"].(map[string]interface{})
	if !ok {
		t.Fatal("enabledPlugins was not preserved")
	}

	if _, ok := plugins["typescript-lsp@claude-plugins-official"]; !ok {
		t.Error("typescript-lsp plugin was not preserved")
	}
}

func TestInstallIsIdempotent(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	inst.Install(ctx) //nolint:errcheck
	inst.Install(ctx) //nolint:errcheck

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings) //nolint:errcheck

	hooksMap := settings["hooks"].(map[string]interface{})
	sessionEnd := hooksMap["SessionEnd"].([]interface{})

	if len(sessionEnd) != 1 {
		t.Errorf("Expected 1 hook after double install, got %d", len(sessionEnd))
	}
}

func TestIsInstalled_NoFile(t *testing.T) {
	inst := claude.New()
	ctx := hooks.InstallContext{
		AxBinary: "/usr/local/bin/ax",
		HomeDir:  "/nonexistent/home",
		Scope:    hooks.UserScope,
	}
	if inst.IsInstalled(ctx) {
		t.Error("Expected false for nonexistent file")
	}
}

func TestInstallCleansUpStaleStopHook(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatal(err)
	}

	existing := `{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'ax sync --sessions-only'",
            "timeout": 30,
            "statusMessage": "Updating AX session metrics"
          }
        ]
      }
    ]
  }
}
`
	os.WriteFile(settingsPath, []byte(existing), 0o644) //nolint:errcheck

	if !inst.IsInstalled(ctx) {
		t.Error("Expected IsInstalled to detect Stop hook")
	}

	if _, err := inst.Install(ctx); err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings) //nolint:errcheck

	hooksMap := settings["hooks"].(map[string]interface{})

	if _, ok := hooksMap["Stop"]; ok {
		t.Error("Expected Stop hook to be removed after Install")
	}

	sessionEnd, ok := hooksMap["SessionEnd"].([]interface{})
	if !ok || len(sessionEnd) != 1 {
		t.Error("Expected exactly 1 SessionEnd hook after Install")
	}
}

func TestUninstallRemovesAllEvents(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatal(err)
	}

	existing := `{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [{"type": "command", "command": "ax push", "statusMessage": "Pushing session data to AX"}]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{"type": "command", "command": "ax sync --sessions-only", "statusMessage": "Updating AX session metrics"}]
      }
    ]
  }
}
`
	os.WriteFile(settingsPath, []byte(existing), 0o644) //nolint:errcheck

	if err := inst.Uninstall(ctx); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings) //nolint:errcheck

	if _, ok := settings["hooks"]; ok {
		t.Error("Expected hooks to be completely removed")
	}
}

func TestIsInstalled_LegacySyncSessionsStatus(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	os.MkdirAll(filepath.Dir(settingsPath), 0o755) //nolint:errcheck

	legacy := `{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [{"type": "command", "command": "something", "statusMessage": "Syncing session data to AX"}]
      }
    ]
  }
}
`
	os.WriteFile(settingsPath, []byte(legacy), 0o644) //nolint:errcheck
	if !inst.IsInstalled(ctx) {
		t.Error("expected IsInstalled to detect legacy 'Syncing session data to AX' status")
	}
}

func TestIsInstalled_LegacyUpdateMetricsStatus(t *testing.T) {
	home := t.TempDir()
	ctx := makeCtx(t, home)
	inst := claude.New()

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	os.MkdirAll(filepath.Dir(settingsPath), 0o755) //nolint:errcheck

	legacy := `{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [{"type": "command", "command": "something", "statusMessage": "Updating AX session metrics"}]
      }
    ]
  }
}
`
	os.WriteFile(settingsPath, []byte(legacy), 0o644) //nolint:errcheck
	if !inst.IsInstalled(ctx) {
		t.Error("expected IsInstalled to detect legacy 'Updating AX session metrics' status")
	}
}
