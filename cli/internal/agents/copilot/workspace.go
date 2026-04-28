package copilot

import (
	"bufio"
	"os"
	"strings"
)

// WorkspaceMetadata is the lightweight repo/session index stored next to
// a Copilot CLI events.jsonl transcript.
type WorkspaceMetadata struct {
	ID         string
	Cwd        string
	GitRoot    string
	Repository string
	Branch     string
	CreatedAt  string
	UpdatedAt  string
}

// parseWorkspace parses the simple top-level scalar fields AX needs from
// workspace.yaml without taking a YAML dependency.
func parseWorkspace(path string) (WorkspaceMetadata, error) {
	f, err := os.Open(path)
	if err != nil {
		return WorkspaceMetadata{}, err
	}
	defer f.Close()

	var workspace WorkspaceMetadata
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

// sessionIDFromPath extracts the session UUID from a session directory.
func sessionIDFromPath(path string) string {
	parts := strings.Split(strings.TrimRight(path, "/"), "/")
	return parts[len(parts)-1]
}
