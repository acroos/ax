// Package cursor provides the hooks.Installer implementation for Cursor CLI.
package cursor

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

// Installer implements hooks.Installer for Cursor CLI.
// Cursor supports both user scope (~/.cursor/hooks.json) and repo scope
// (<repo>/.cursor/hooks.json).
type Installer struct{}

// New returns a new Cursor CLI hook Installer.
func New() *Installer { return &Installer{} }

func (i *Installer) AgentID() agents.AgentID { return agents.CursorCli }

// Scopes returns UserScope | RepoScope — Cursor supports both.
func (i *Installer) Scopes() hooks.Scope { return hooks.UserScope | hooks.RepoScope }

// HomeExists reports whether the ~/.cursor directory is present.
func (i *Installer) HomeExists() bool {
	if dir := os.Getenv("CURSOR_HOME"); dir != "" {
		_, err := os.Stat(dir)
		return err == nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(home, ".cursor"))
	return err == nil
}

func hookPath(ctx hooks.InstallContext) (string, error) {
	switch ctx.Scope {
	case hooks.UserScope:
		return filepath.Join(ctx.HomeDir, ".cursor", "hooks.json"), nil
	case hooks.RepoScope:
		return filepath.Join(ctx.RepoPath, ".cursor", "hooks.json"), nil
	default:
		return "", fmt.Errorf("cursor installer: unsupported scope %d", ctx.Scope)
	}
}

// Install writes the AX Cursor sessionEnd hook for the given scope.
//
// Hook file shape (per Cursor docs Jan 2026):
//
//	{
//	  "version": 1,
//	  "hooks": {
//	    "sessionEnd": [
//	      { "type": "command", "command": "<ax push command>" }
//	    ]
//	  }
//	}
//
// Note: Cursor's sessionEnd hook is reported as flaky in CLI mode (Jan 2026).
// Users should run `ax push --repo .` manually if automatic pushes are missing.
func (i *Installer) Install(ctx hooks.InstallContext) (hooks.Installed, error) {
	path, err := hookPath(ctx)
	if err != nil {
		return hooks.Installed{}, err
	}

	cmd := pushcommand.Build(pushcommand.Spec{
		AxBinary:       ctx.AxBinary,
		WorktreeMarker: "", // Cursor has no AX-managed worktree convention
	})

	hookFile := cursorHookFile{
		Version: 1,
		Hooks: map[string][]cursorHookEntry{
			"sessionEnd": {{Type: "command", Command: cmd}},
		},
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return hooks.Installed{}, fmt.Errorf("failed to create Cursor hooks directory: %w", err)
	}

	data, err := json.MarshalIndent(hookFile, "", "  ")
	if err != nil {
		return hooks.Installed{}, err
	}

	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return hooks.Installed{}, fmt.Errorf("failed to write Cursor hook: %w", err)
	}

	msg := ""
	if ctx.Scope == hooks.RepoScope {
		msg = fmt.Sprintf("Created %s — commit this file so your team gets automatic Cursor CLI session collection.", path)
	}

	return hooks.Installed{
		Path:    path,
		Created: true,
		Message: msg,
	}, nil
}

// Uninstall removes the AX Cursor hook if AX owns it.
// For each supported scope, it attempts removal (best-effort, ignores missing files).
func (i *Installer) Uninstall(ctx hooks.InstallContext) error {
	path, err := hookPath(ctx)
	if err != nil {
		return nil // unsupported scope — skip silently
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil // file doesn't exist — nothing to remove
	}
	var existing cursorHookFile
	if err := json.Unmarshal(data, &existing); err != nil {
		return nil // can't parse — don't touch it
	}
	if !isAXCursorHook(existing) {
		return nil // not ours — leave it alone
	}

	// Remove AX entries from sessionEnd. If nothing remains, delete the file.
	entries := existing.Hooks["sessionEnd"]
	var kept []cursorHookEntry
	for _, e := range entries {
		if !strings.Contains(e.Command, "ax push") {
			kept = append(kept, e)
		}
	}

	if len(kept) == 0 {
		delete(existing.Hooks, "sessionEnd")
	} else {
		existing.Hooks["sessionEnd"] = kept
	}

	if len(existing.Hooks) == 0 {
		// No hooks left — remove the file entirely.
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}

	// Write back the filtered file.
	out, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(out, '\n'), 0o644)
}

// IsInstalled reports whether an AX Cursor hook is present for the given scope.
func (i *Installer) IsInstalled(ctx hooks.InstallContext) bool {
	path, err := hookPath(ctx)
	if err != nil {
		return false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	var existing cursorHookFile
	if err := json.Unmarshal(data, &existing); err != nil {
		return false
	}
	return isAXCursorHook(existing)
}

type cursorHookFile struct {
	Version int                           `json:"version"`
	Hooks   map[string][]cursorHookEntry `json:"hooks"`
}

type cursorHookEntry struct {
	Type    string `json:"type"`
	Command string `json:"command"`
}

func isAXCursorHook(hookFile cursorHookFile) bool {
	entries := hookFile.Hooks["sessionEnd"]
	for _, e := range entries {
		if e.Type == "command" && strings.Contains(e.Command, "ax push") {
			return true
		}
	}
	return false
}
