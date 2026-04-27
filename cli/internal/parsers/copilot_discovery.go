package parsers

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// CopilotWorkspaceMetadata is the lightweight repo/session index stored next to
// a Copilot CLI events.jsonl transcript.
type CopilotWorkspaceMetadata struct {
	ID         string
	Cwd        string
	GitRoot    string
	Repository string
	Branch     string
	CreatedAt  string
	UpdatedAt  string
}

// DefaultCopilotDir returns the Copilot CLI home directory. COPILOT_HOME takes
// precedence so tests and users with custom state locations work as expected.
func DefaultCopilotDir() string {
	if dir := os.Getenv("COPILOT_HOME"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".copilot")
}

// CopilotDirForClaudeDir returns the default Copilot home that sits next to a
// provided Claude home. This keeps bulk discovery testable with temp dirs.
func CopilotDirForClaudeDir(claudeDir string) string {
	if dir := os.Getenv("COPILOT_HOME"); dir != "" {
		return dir
	}
	return filepath.Join(filepath.Dir(claudeDir), ".copilot")
}

// FindCopilotSessionsForRepo returns Copilot CLI session directories whose
// workspace metadata points at ownerRepo and that have an events.jsonl file.
func FindCopilotSessionsForRepo(copilotDir, ownerRepo string) ([]string, error) {
	workspaces, err := DiscoverCopilotWorkspaces(copilotDir)
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

// DiscoverCopilotWorkspaces scans ~/.copilot/session-state/*/workspace.yaml.
func DiscoverCopilotWorkspaces(copilotDir string) (map[string]CopilotWorkspaceMetadata, error) {
	pattern := filepath.Join(copilotDir, "session-state", "*", "workspace.yaml")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to glob Copilot workspaces: %w", err)
	}

	result := make(map[string]CopilotWorkspaceMetadata)
	for _, workspacePath := range matches {
		workspace, err := ParseCopilotWorkspace(workspacePath)
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

// ParseCopilotWorkspace parses the simple top-level scalar fields AX needs from
// workspace.yaml without taking a YAML dependency.
func ParseCopilotWorkspace(path string) (CopilotWorkspaceMetadata, error) {
	f, err := os.Open(path)
	if err != nil {
		return CopilotWorkspaceMetadata{}, err
	}
	defer f.Close()

	var workspace CopilotWorkspaceMetadata
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, ":") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
		switch key {
		case "id":
			workspace.ID = value
		case "cwd":
			workspace.Cwd = value
		case "git_root":
			workspace.GitRoot = value
		case "repository":
			workspace.Repository = value
		case "branch":
			workspace.Branch = value
		case "created_at":
			workspace.CreatedAt = value
		case "updated_at":
			workspace.UpdatedAt = value
		}
	}
	return workspace, scanner.Err()
}

// CopilotSessionIDFromPath extracts the session UUID from a session directory.
func CopilotSessionIDFromPath(path string) string {
	return filepath.Base(path)
}
