package hooks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallAndUninstall(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	// Install on empty settings
	err := Install(settingsPath, "/usr/local/bin/ax")
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	// Verify the file was created
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("Failed to read settings: %v", err)
	}

	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("Failed to parse settings: %v", err)
	}

	// Verify hook structure
	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected hooks key in settings")
	}

	sessionEnd, ok := hooks["SessionEnd"].([]interface{})
	if !ok {
		t.Fatal("Expected SessionEnd array in hooks")
	}

	if len(sessionEnd) != 1 {
		t.Fatalf("Expected 1 SessionEnd hook, got %d", len(sessionEnd))
	}

	// Verify IsInstalled
	if !IsInstalled(settingsPath) {
		t.Error("Expected IsInstalled to return true")
	}

	// Uninstall
	err = Uninstall(settingsPath)
	if err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	if IsInstalled(settingsPath) {
		t.Error("Expected IsInstalled to return false after uninstall")
	}
}

func TestInstallPreservesExistingSettings(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	// Write existing settings
	existing := `{
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true
  }
}
`
	os.WriteFile(settingsPath, []byte(existing), 0644)

	// Install
	err := Install(settingsPath, "/usr/local/bin/ax")
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	// Verify plugins are preserved
	data, _ := os.ReadFile(settingsPath)
	var settings Settings
	json.Unmarshal(data, &settings)

	plugins, ok := settings["enabledPlugins"].(map[string]interface{})
	if !ok {
		t.Fatal("enabledPlugins was not preserved")
	}

	if _, ok := plugins["typescript-lsp@claude-plugins-official"]; !ok {
		t.Error("typescript-lsp plugin was not preserved")
	}
}

func TestInstallIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	// Install twice
	Install(settingsPath, "/usr/local/bin/ax")
	Install(settingsPath, "/usr/local/bin/ax")

	data, _ := os.ReadFile(settingsPath)
	var settings Settings
	json.Unmarshal(data, &settings)

	hooks := settings["hooks"].(map[string]interface{})
	sessionEnd := hooks["SessionEnd"].([]interface{})

	if len(sessionEnd) != 1 {
		t.Errorf("Expected 1 hook after double install, got %d", len(sessionEnd))
	}
}

func TestIsInstalled_NoFile(t *testing.T) {
	if IsInstalled("/nonexistent/path/settings.json") {
		t.Error("Expected false for nonexistent file")
	}
}

func TestInstallCleansUpStaleStopHook(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	// Write settings with a stale Stop hook (from old local mode)
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
	os.WriteFile(settingsPath, []byte(existing), 0644)

	// IsInstalled should detect the Stop hook
	if !IsInstalled(settingsPath) {
		t.Error("Expected IsInstalled to detect Stop hook")
	}

	// Install should remove the Stop hook and add SessionEnd
	err := Install(settingsPath, "/usr/local/bin/ax")
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings Settings
	json.Unmarshal(data, &settings)

	hooks := settings["hooks"].(map[string]interface{})

	// Stop hook should be gone
	if _, ok := hooks["Stop"]; ok {
		t.Error("Expected Stop hook to be removed after Install")
	}

	// SessionEnd hook should exist
	sessionEnd, ok := hooks["SessionEnd"].([]interface{})
	if !ok || len(sessionEnd) != 1 {
		t.Error("Expected exactly 1 SessionEnd hook after Install")
	}
}

func TestUninstallRemovesAllEvents(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	// Write settings with hooks on both events
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
	os.WriteFile(settingsPath, []byte(existing), 0644)

	err := Uninstall(settingsPath)
	if err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings Settings
	json.Unmarshal(data, &settings)

	if _, ok := settings["hooks"]; ok {
		t.Error("Expected hooks to be completely removed")
	}
}
