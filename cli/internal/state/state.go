// Package state tracks which sessions have been pushed to avoid re-sending.
//
// State is stored per-repo at ~/.ax/state/<owner>-<repo>.json and contains
// the set of session IDs that have already been successfully pushed.
package state

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// RepoState holds the push state for a single repo.
type RepoState struct {
	PushedSessionIDs []string `json:"pushed_session_ids"`
}

// stateDir returns the path to the state directory (~/.ax/state/).
func stateDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(home, ".ax", "state"), nil
}

// statePath returns the file path for a repo's state file.
func statePath(ownerRepo string) (string, error) {
	dir, err := stateDir()
	if err != nil {
		return "", err
	}
	// Sanitize owner/repo → owner-repo for filename
	filename := strings.ReplaceAll(ownerRepo, "/", "-") + ".json"
	return filepath.Join(dir, filename), nil
}

// Load reads the push state for a repo. Returns an empty state if the file doesn't exist.
func Load(ownerRepo string) (*RepoState, error) {
	path, err := statePath(ownerRepo)
	if err != nil {
		return &RepoState{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &RepoState{}, nil
		}
		return nil, fmt.Errorf("failed to read state file: %w", err)
	}

	var s RepoState
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("failed to parse state file: %w", err)
	}
	return &s, nil
}

// Save writes the push state for a repo to disk.
func Save(ownerRepo string, s *RepoState) error {
	path, err := statePath(ownerRepo)
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create state directory: %w", err)
	}

	data, err := json.Marshal(s)
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("failed to write state file: %w", err)
	}
	return nil
}

// PushedSet returns the pushed session IDs as a set for fast lookup.
func (s *RepoState) PushedSet() map[string]bool {
	set := make(map[string]bool, len(s.PushedSessionIDs))
	for _, id := range s.PushedSessionIDs {
		set[id] = true
	}
	return set
}

// AddPushed adds session IDs to the pushed set and deduplicates.
func (s *RepoState) AddPushed(ids []string) {
	existing := s.PushedSet()
	for _, id := range ids {
		if !existing[id] {
			s.PushedSessionIDs = append(s.PushedSessionIDs, id)
			existing[id] = true
		}
	}
}

// SessionIDFromPath extracts the session ID from a session file path.
// Session files are named <session-id>.jsonl.
func SessionIDFromPath(path string) string {
	return strings.TrimSuffix(filepath.Base(path), ".jsonl")
}

// FilterNewSessionFiles returns only session files whose IDs are not in the pushed set.
func FilterNewSessionFiles(sessionFiles []string, pushed map[string]bool) []string {
	if len(pushed) == 0 {
		return sessionFiles
	}

	var newFiles []string
	for _, f := range sessionFiles {
		id := SessionIDFromPath(f)
		if !pushed[id] {
			newFiles = append(newFiles, f)
		}
	}
	return newFiles
}
