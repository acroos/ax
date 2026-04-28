package cursor

import (
	"encoding/json"
	"path/filepath"
	"strings"
)

// workspaceTrusted is the JSON shape of .workspace-trusted files stored under
// ~/.cursor/projects/<encoded-path>/.workspace-trusted.
// The workspacePath field is the authoritative local path for the project.
type workspaceTrusted struct {
	WorkspacePath string `json:"workspacePath"`
	TrustedAt     string `json:"trustedAt,omitempty"`
}

// jsonUnmarshal is a thin wrapper so tests can swap it out; defaults to
// json.Unmarshal.
var jsonUnmarshal = func(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

// sessionIDFromPath extracts the session ID from a Cursor transcript path.
// Cursor paths look like: .../agent-transcripts/<uuid>/<uuid>.jsonl
// The session ID is the UUID (without the .jsonl extension).
func sessionIDFromPath(transcriptPath string) string {
	base := filepath.Base(transcriptPath)
	return strings.TrimSuffix(base, ".jsonl")
}
