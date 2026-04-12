// Package hooks manages Claude Code hook installation for automatic
// session data push to the AX managed service after each session ends.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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

// pushCommand returns the shell command that runs ax push on session end.
// It handles both regular repos and Claude Code worktrees. If the CWD no longer
// exists (e.g., worktree removed at session end), it resolves the main repo from
// the worktree path pattern (<repo>/.claude/worktrees/<name>/).
func pushCommand(axBinary string) string {
	return fmt.Sprintf(
		`bash -c 'INPUT=$(cat); CWD=$(echo "$INPUT" | grep -o "\"cwd\":\"[^\"]*\"" | cut -d\" -f4); if [ -z "$CWD" ]; then exit 0; fi; if [ -e "$CWD/.git" ]; then %s push --repo "$CWD" > /dev/null 2>&1; else REPO=$(echo "$CWD" | sed -n "s|/\.claude/worktrees/.*||p"); if [ -n "$REPO" ] && [ -d "$REPO/.git" ]; then %s push --repo "$REPO" > /dev/null 2>&1; fi; fi'`,
		axBinary, axBinary,
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
				Command:       pushCommand(axBinary),
				Timeout:       60,
				StatusMessage: "Pushing session data to AX",
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
		if status == "Pushing session data to AX" || status == "Syncing session data to AX" {
			return true
		}
		if len(cmd) > 0 && (strings.Contains(cmd, "ax push") || strings.Contains(cmd, "ax sync")) {
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
