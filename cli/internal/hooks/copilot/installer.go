// Package copilot provides the hooks.Installer implementation for Copilot CLI.
package copilot

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/hooks"
)

func init() {
	hooks.Register(New())
}

// Installer implements hooks.Installer for Copilot CLI (repo scope).
type Installer struct{}

// New returns a new Copilot CLI hook Installer.
func New() *Installer { return &Installer{} }

func (i *Installer) AgentID() agents.AgentID { return agents.CopilotCli }

// Scopes returns RepoScope — Copilot CLI hooks live in .github/hooks/session-end.json.
func (i *Installer) Scopes() hooks.Scope { return hooks.RepoScope }

// HomeExists reports whether the Copilot CLI state directory is present.
func (i *Installer) HomeExists() bool {
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

func hookPath(repoPath string) string {
	return filepath.Join(repoPath, ".github", "hooks", "session-end.json")
}

// Install writes the AX repo-local Copilot CLI sessionEnd hook.
// Copilot hooks use a simple "ax push --repo ." command (no worktree handling needed).
func (i *Installer) Install(ctx hooks.InstallContext) (hooks.Installed, error) {
	if !isGitRepo(ctx.RepoPath) {
		return hooks.Installed{}, nil
	}

	path := hookPath(ctx.RepoPath)

	hookFile := copilotHookFile{
		Version: 1,
		Hooks: map[string][]copilotHookEntry{
			"sessionEnd": {
				{Type: "command", Bash: "ax push --repo .", TimeoutSec: 30},
			},
		},
	}

	if data, err := os.ReadFile(path); err == nil {
		var existing copilotHookFile
		if json.Unmarshal(data, &existing) != nil || !isAXCopilotHook(existing) {
			return hooks.Installed{}, nil
		}
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return hooks.Installed{}, fmt.Errorf("failed to create Copilot hooks directory: %w", err)
	}

	data, err := json.MarshalIndent(hookFile, "", "  ")
	if err != nil {
		return hooks.Installed{}, err
	}

	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return hooks.Installed{}, fmt.Errorf("failed to write Copilot hook: %w", err)
	}

	return hooks.Installed{
		Path:    path,
		Created: true,
		Message: fmt.Sprintf("Created %s — commit this file so your team gets automatic Copilot CLI session collection.", path),
	}, nil
}

// Uninstall removes the AX repo-local Copilot CLI hook if AX owns it.
func (i *Installer) Uninstall(ctx hooks.InstallContext) error {
	path := hookPath(ctx.RepoPath)
	data, err := os.ReadFile(path)
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
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// IsInstalled reports whether an AX Copilot hook is present in the repo.
func (i *Installer) IsInstalled(ctx hooks.InstallContext) bool {
	path := hookPath(ctx.RepoPath)
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	var existing copilotHookFile
	if err := json.Unmarshal(data, &existing); err != nil {
		return false
	}
	return isAXCopilotHook(existing)
}

type copilotHookFile struct {
	Version int                           `json:"version"`
	Hooks   map[string][]copilotHookEntry `json:"hooks"`
}

type copilotHookEntry struct {
	Type       string `json:"type"`
	Bash       string `json:"bash"`
	TimeoutSec int    `json:"timeoutSec"`
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
