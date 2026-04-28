// Package claude provides the hooks.Installer implementation for Claude Code.
package claude

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/hooks"
	"github.com/austinroos/ax/internal/hooks/pushcommand"
)

func init() {
	hooks.Register(New())
}

// Installer implements hooks.Installer for Claude Code (user scope).
type Installer struct{}

// New returns a new Claude Code hook Installer.
func New() *Installer { return &Installer{} }

func (i *Installer) AgentID() agents.AgentID { return agents.ClaudeCode }

// Scopes returns UserScope — Claude Code hooks live in ~/.claude/settings.json.
func (i *Installer) Scopes() hooks.Scope { return hooks.UserScope }

// HomeExists reports whether the ~/.claude directory is present.
func (i *Installer) HomeExists() bool {
	if dir := os.Getenv("AX_CLAUDE_HOME"); dir != "" {
		_, err := os.Stat(dir)
		return err == nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(home, ".claude"))
	return err == nil
}

func (i *Installer) settingsPath(ctx hooks.InstallContext) string {
	if dir := os.Getenv("AX_CLAUDE_HOME"); dir != "" {
		return filepath.Join(dir, "settings.json")
	}
	return filepath.Join(ctx.HomeDir, ".claude", "settings.json")
}

// Install adds an AX SessionEnd hook to the Claude Code settings file.
// If a hook already exists it is updated. Stale AX hooks on other events
// (e.g. Stop) are removed. Other settings are preserved.
func (i *Installer) Install(ctx hooks.InstallContext) (hooks.Installed, error) {
	settingsPath := i.settingsPath(ctx)

	settings := make(settings)
	if data, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return hooks.Installed{}, fmt.Errorf("failed to parse %s: %w", settingsPath, err)
		}
	}

	cmd := pushcommand.Build(pushcommand.Spec{
		AxBinary:       ctx.AxBinary,
		WorktreeMarker: "/.claude/worktrees/",
	})

	hook := hookConfig{
		Matcher: "",
		Hooks: []hookSpec{
			{
				Type:          "command",
				Command:       cmd,
				Timeout:       60,
				StatusMessage: "Pushing session data to AX",
			},
		},
	}

	hooksMap, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		hooksMap = make(map[string]interface{})
	}

	for _, event := range hookEvents {
		existingHooks, ok := hooksMap[event].([]interface{})
		if !ok {
			continue
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
			delete(hooksMap, event)
		} else {
			hooksMap[event] = filtered
		}
	}

	sessionEnd, _ := hooksMap["SessionEnd"].([]interface{})
	sessionEnd = append(sessionEnd, hook)
	hooksMap["SessionEnd"] = sessionEnd
	settings["hooks"] = hooksMap

	dir := filepath.Dir(settingsPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return hooks.Installed{}, fmt.Errorf("failed to create directory: %w", err)
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return hooks.Installed{}, fmt.Errorf("failed to marshal settings: %w", err)
	}

	if err := os.WriteFile(settingsPath, append(data, '\n'), 0o644); err != nil {
		return hooks.Installed{}, fmt.Errorf("failed to write settings: %w", err)
	}

	return hooks.Installed{Path: settingsPath, Created: true}, nil
}

// Uninstall removes all AX hooks from the Claude Code settings file.
func (i *Installer) Uninstall(ctx hooks.InstallContext) error {
	settingsPath := i.settingsPath(ctx)

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return nil
	}

	s := make(settings)
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("failed to parse %s: %w", settingsPath, err)
	}

	hooksMap, ok := s["hooks"].(map[string]interface{})
	if !ok {
		return nil
	}

	for _, event := range hookEvents {
		existingHooks, ok := hooksMap[event].([]interface{})
		if !ok {
			continue
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
			delete(hooksMap, event)
		} else {
			hooksMap[event] = filtered
		}
	}

	if len(hooksMap) == 0 {
		delete(s, "hooks")
	} else {
		s["hooks"] = hooksMap
	}

	out, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, append(out, '\n'), 0o644)
}

// IsInstalled reports whether an AX hook is configured on any event.
func (i *Installer) IsInstalled(ctx hooks.InstallContext) bool {
	settingsPath := i.settingsPath(ctx)

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return false
	}

	s := make(settings)
	if err := json.Unmarshal(data, &s); err != nil {
		return false
	}

	hooksMap, ok := s["hooks"].(map[string]interface{})
	if !ok {
		return false
	}

	for _, event := range hookEvents {
		existingHooks, ok := hooksMap[event].([]interface{})
		if !ok {
			continue
		}
		for _, h := range existingHooks {
			hMap, ok := h.(map[string]interface{})
			if ok && isAXHook(hMap) {
				return true
			}
		}
	}
	return false
}

// hookEvents lists all Claude Code hook events that AX may use.
var hookEvents = []string{"SessionEnd", "Stop"}

// hookConfig represents the hook entry for Claude Code settings.
type hookConfig struct {
	Matcher string     `json:"matcher"`
	Hooks   []hookSpec `json:"hooks"`
}

// hookSpec represents a single hook command.
type hookSpec struct {
	Type          string `json:"type"`
	Command       string `json:"command"`
	Timeout       int    `json:"timeout,omitempty"`
	StatusMessage string `json:"statusMessage,omitempty"`
}

// settings represents the Claude Code settings.json structure.
// We only care about the hooks field — everything else is preserved.
type settings map[string]interface{}

// isAXHook checks if a hook configuration belongs to ax.
// Three legacy status-message strings are checked for backwards compatibility.
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
		if status == "Pushing session data to AX" || status == "Syncing session data to AX" || status == "Updating AX session metrics" {
			return true
		}
		if len(cmd) > 0 && (strings.Contains(cmd, "ax push") || strings.Contains(cmd, "ax sync")) {
			return true
		}
	}
	return false
}
