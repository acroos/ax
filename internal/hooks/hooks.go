// Package hooks manages Claude Code hook installation for automatic
// session data capture after each session ends.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// HookConfig represents the hook entry for Claude Code settings.
type HookConfig struct {
	Matcher string     `json:"matcher"`
	Hooks   []HookSpec `json:"hooks"`
}

// HookSpec represents a single hook command.
type HookSpec struct {
	Type          string `json:"type"`
	Command       string `json:"command"`
	Timeout       int    `json:"timeout,omitempty"`
	StatusMessage string `json:"statusMessage,omitempty"`
}

// Settings represents the Claude Code settings.json structure.
// We only care about the hooks field — everything else is preserved.
type Settings map[string]interface{}

// hookCommand returns the shell command that runs ax sync on session end.
func hookCommand(axBinary string) string {
	return fmt.Sprintf(
		`bash -c 'INPUT=$(cat); CWD=$(echo "$INPUT" | grep -o "\"cwd\":\"[^\"]*\"" | cut -d\" -f4); if [ -n "$CWD" ] && [ -d "$CWD/.git" ]; then %s sync --repo "$CWD" > /dev/null 2>&1; fi'`,
		axBinary,
	)
}

// sessionsSyncCommand returns a lightweight command for mid-session syncing.
func sessionsSyncCommand(axBinary string) string {
	return fmt.Sprintf(
		`bash -c 'INPUT=$(cat); CWD=$(echo "$INPUT" | grep -o "\"cwd\":\"[^\"]*\"" | cut -d\" -f4); if [ -n "$CWD" ] && [ -d "$CWD/.git" ]; then %s sync --sessions-only --repo "$CWD" > /dev/null 2>&1; fi'`,
		axBinary,
	)
}

// Install adds an ax SessionEnd hook to the Claude Code settings file.
// If a hook already exists, it is updated. Other settings are preserved.
func Install(settingsPath, axBinary string) error {
	// Read existing settings
	settings := make(Settings)
	if data, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return fmt.Errorf("failed to parse %s: %w", settingsPath, err)
		}
	}

	// Build the hook
	hook := HookConfig{
		Matcher: "",
		Hooks: []HookSpec{
			{
				Type:          "command",
				Command:       hookCommand(axBinary),
				Timeout:       60,
				StatusMessage: "Syncing session data to AX",
			},
		},
	}

	// Get or create the hooks map
	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		hooks = make(map[string]interface{})
	}

	// Check if an ax hook already exists in SessionEnd
	existingHooks, ok := hooks["SessionEnd"].([]interface{})
	if ok {
		// Remove any existing ax hooks
		var filtered []interface{}
		for _, h := range existingHooks {
			hMap, ok := h.(map[string]interface{})
			if !ok {
				filtered = append(filtered, h)
				continue
			}
			if !isAXHook(hMap) {
				filtered = append(filtered, h)
			}
		}
		existingHooks = filtered
	} else {
		existingHooks = nil
	}

	// Add our hook
	existingHooks = append(existingHooks, hook)
	hooks["SessionEnd"] = existingHooks
	settings["hooks"] = hooks

	// Write back
	dir := filepath.Dir(settingsPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	if err := os.WriteFile(settingsPath, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("failed to write settings: %w", err)
	}

	return nil
}

// InstallStopHook adds a Stop hook that runs a lightweight sessions-only sync
// after each Claude response. This keeps metrics updated mid-session.
func InstallStopHook(settingsPath, axBinary string) error {
	settings := make(Settings)
	if data, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return fmt.Errorf("failed to parse %s: %w", settingsPath, err)
		}
	}

	hook := HookConfig{
		Matcher: "",
		Hooks: []HookSpec{
			{
				Type:          "command",
				Command:       sessionsSyncCommand(axBinary),
				Timeout:       30,
				StatusMessage: "Updating AX session metrics",
			},
		},
	}

	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		hooks = make(map[string]interface{})
	}

	existingHooks, ok := hooks["Stop"].([]interface{})
	if ok {
		var filtered []interface{}
		for _, h := range existingHooks {
			hMap, ok := h.(map[string]interface{})
			if !ok || !isAXHook(hMap) {
				filtered = append(filtered, h)
			}
		}
		existingHooks = filtered
	} else {
		existingHooks = nil
	}

	existingHooks = append(existingHooks, hook)
	hooks["Stop"] = existingHooks
	settings["hooks"] = hooks

	dir := filepath.Dir(settingsPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, append(data, '\n'), 0o644)
}

// UninstallStopHook removes the ax Stop hook.
func UninstallStopHook(settingsPath string) error {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return nil
	}

	settings := make(Settings)
	if err := json.Unmarshal(data, &settings); err != nil {
		return err
	}

	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		return nil
	}

	existingHooks, ok := hooks["Stop"].([]interface{})
	if !ok {
		return nil
	}

	var filtered []interface{}
	for _, h := range existingHooks {
		hMap, ok := h.(map[string]interface{})
		if !ok || !isAXHook(hMap) {
			filtered = append(filtered, h)
		}
	}

	if len(filtered) == 0 {
		delete(hooks, "Stop")
	} else {
		hooks["Stop"] = filtered
	}

	if len(hooks) == 0 {
		delete(settings, "hooks")
	}

	out, _ := json.MarshalIndent(settings, "", "  ")
	return os.WriteFile(settingsPath, append(out, '\n'), 0o644)
}

// Uninstall removes the ax SessionEnd hook from the Claude Code settings file.
func Uninstall(settingsPath string) error {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return nil // no settings file = nothing to uninstall
	}

	settings := make(Settings)
	if err := json.Unmarshal(data, &settings); err != nil {
		return fmt.Errorf("failed to parse %s: %w", settingsPath, err)
	}

	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		return nil
	}

	existingHooks, ok := hooks["SessionEnd"].([]interface{})
	if !ok {
		return nil
	}

	var filtered []interface{}
	for _, h := range existingHooks {
		hMap, ok := h.(map[string]interface{})
		if !ok {
			filtered = append(filtered, h)
			continue
		}
		if !isAXHook(hMap) {
			filtered = append(filtered, h)
		}
	}

	if len(filtered) == 0 {
		delete(hooks, "SessionEnd")
	} else {
		hooks["SessionEnd"] = filtered
	}

	if len(hooks) == 0 {
		delete(settings, "hooks")
	} else {
		settings["hooks"] = hooks
	}

	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, append(out, '\n'), 0o644)
}

// IsInstalled checks if an ax hook is already configured.
func IsInstalled(settingsPath string) bool {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return false
	}

	settings := make(Settings)
	if err := json.Unmarshal(data, &settings); err != nil {
		return false
	}

	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		return false
	}

	existingHooks, ok := hooks["SessionEnd"].([]interface{})
	if !ok {
		return false
	}

	for _, h := range existingHooks {
		hMap, ok := h.(map[string]interface{})
		if ok && isAXHook(hMap) {
			return true
		}
	}
	return false
}

// isAXHook checks if a hook configuration belongs to ax.
func isAXHook(hookMap map[string]interface{}) bool {
	innerHooks, ok := hookMap["hooks"].([]interface{})
	if !ok {
		return false
	}
	for _, h := range innerHooks {
		spec, ok := h.(map[string]interface{})
		if !ok {
			continue
		}
		cmd, _ := spec["command"].(string)
		status, _ := spec["statusMessage"].(string)
		if status == "Syncing session data to AX" {
			return true
		}
		// Also match by command containing "ax sync"
		if len(cmd) > 0 && (contains(cmd, "ax sync") || contains(cmd, "ax sync")) {
			return true
		}
	}
	return false
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// DefaultSettingsPath returns the path to ~/.claude/settings.json.
func DefaultSettingsPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "settings.json")
}
