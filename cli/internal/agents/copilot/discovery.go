package copilot

import (
	"fmt"
	"os"
	"path/filepath"
)

// findSessionsForRepo returns Copilot CLI session directories whose
// workspace metadata points at ownerRepo and that have an events.jsonl file.
func findSessionsForRepo(copilotDir, ownerRepo string) ([]string, error) {
	workspaces, err := discoverWorkspaces(copilotDir)
	if err != nil {
		return nil, err
	}

	var sessions []string
	for sessionDir, workspace := range workspaces {
		if workspace.Repository != ownerRepo {
			continue
		}
		if _, err := os.Stat(filepath.Join(sessionDir, "events.jsonl")); err == nil {
			sessions = append(sessions, sessionDir)
		}
	}
	return sessions, nil
}

// discoverWorkspaces scans ~/.copilot/session-state/*/workspace.yaml.
func discoverWorkspaces(copilotDir string) (map[string]WorkspaceMetadata, error) {
	pattern := filepath.Join(copilotDir, "session-state", "*", "workspace.yaml")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to glob Copilot workspaces: %w", err)
	}

	result := make(map[string]WorkspaceMetadata)
	for _, workspacePath := range matches {
		workspace, err := parseWorkspace(workspacePath)
		if err != nil || workspace.Repository == "" {
			continue
		}
		sessionDir := filepath.Dir(workspacePath)
		if _, err := os.Stat(filepath.Join(sessionDir, "events.jsonl")); err != nil {
			continue
		}
		result[sessionDir] = workspace
	}
	return result, nil
}
