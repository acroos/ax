package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type copilotHookFile struct {
	Version int                           `json:"version"`
	Hooks   map[string][]copilotHookEntry `json:"hooks"`
}

type copilotHookEntry struct {
	Type       string `json:"type"`
	Bash       string `json:"bash"`
	TimeoutSec int    `json:"timeoutSec"`
}

// CopilotHomeExists reports whether Copilot CLI state exists for this user.
func CopilotHomeExists() bool {
	if dir := os.Getenv("COPILOT_HOME"); dir != "" {
		_, err := os.Stat(dir)
		return err == nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(home, ".copilot"))
	return err == nil
}

// InstallCopilot writes AX's repo-local Copilot CLI sessionEnd hook.
func InstallCopilot(repoPath string) (bool, error) {
	if !isGitRepo(repoPath) {
		return false, nil
	}

	hookPath := filepath.Join(repoPath, ".github", "hooks", "session-end.json")
	hookFile := copilotHookFile{
		Version: 1,
		Hooks: map[string][]copilotHookEntry{
			"sessionEnd": {
				{Type: "command", Bash: "ax push --repo .", TimeoutSec: 30},
			},
		},
	}

	if data, err := os.ReadFile(hookPath); err == nil {
		var existing copilotHookFile
		if json.Unmarshal(data, &existing) != nil || !isAXCopilotHook(existing) {
			return false, nil
		}
	}

	if err := os.MkdirAll(filepath.Dir(hookPath), 0o755); err != nil {
		return false, fmt.Errorf("failed to create Copilot hooks directory: %w", err)
	}
	data, err := json.MarshalIndent(hookFile, "", "  ")
	if err != nil {
		return false, err
	}
	if err := os.WriteFile(hookPath, append(data, '\n'), 0o644); err != nil {
		return false, fmt.Errorf("failed to write Copilot hook: %w", err)
	}
	return true, nil
}

// UninstallCopilot removes AX's repo-local Copilot CLI hook if AX owns it.
func UninstallCopilot(repoPath string) error {
	hookPath := filepath.Join(repoPath, ".github", "hooks", "session-end.json")
	data, err := os.ReadFile(hookPath)
	if err != nil {
		return nil
	}
	var existing copilotHookFile
	if err := json.Unmarshal(data, &existing); err != nil {
		return nil
	}
	if !isAXCopilotHook(existing) {
		return nil
	}
	if err := os.Remove(hookPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func isAXCopilotHook(hookFile copilotHookFile) bool {
	entries := hookFile.Hooks["sessionEnd"]
	if len(entries) != 1 {
		return false
	}
	entry := entries[0]
	return entry.Type == "command" && strings.Contains(entry.Bash, "ax push --repo")
}

func isGitRepo(path string) bool {
	if _, err := os.Stat(filepath.Join(path, ".git")); err == nil {
		return true
	}
	return false
}
