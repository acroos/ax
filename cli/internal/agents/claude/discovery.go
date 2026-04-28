package claude

import (
	"os"
	"path/filepath"
	"strings"
)

// FindSessionFiles returns all session JSONL files for a given project path.
// It also discovers sessions from Claude Code worktrees belonging to the same repo
// (stored under <repo>/.claude/worktrees/<name>/).
//
// Claude Code stores sessions in two formats:
//  1. Top-level JSONL files: <project-dir>/<uuid>.jsonl
//  2. Directory-based sessions: <project-dir>/<uuid>/subagents/agent-*.jsonl
//
// For directory-based sessions (those without a corresponding top-level .jsonl
// file), the directory path is returned. ParseSession handles both file and
// directory paths.
func findSessionFiles(claudeDir, projectPath string) ([]string, error) {
	// Claude Code stores project sessions in ~/.claude/projects/<encoded-path>/
	// Claude Code replaces both "/" and "." with "-" when encoding paths.
	encodedPath := strings.ReplaceAll(strings.ReplaceAll(projectPath, "/", "-"), ".", "-")
	projectDir := filepath.Join(claudeDir, "projects", encodedPath)

	var allMatches []string

	if _, err := os.Stat(projectDir); err == nil {
		matches, err := collectSessionPaths(projectDir)
		if err != nil {
			return nil, err
		}
		allMatches = append(allMatches, matches...)
	}

	// Also find sessions from Claude Code worktrees for this repo.
	// Worktrees are created at <repo>/.claude/worktrees/<name>/, and their
	// sessions are stored under a separate encoded path. We glob for any
	// project directory that matches the worktree naming pattern.
	worktreePattern := filepath.Join(claudeDir, "projects", encodedPath+"--claude-worktrees-*")
	worktreeDirs, err := filepath.Glob(worktreePattern)
	if err != nil {
		return nil, err
	}
	for _, wtDir := range worktreeDirs {
		matches, err := collectSessionPaths(wtDir)
		if err != nil {
			return nil, err
		}
		allMatches = append(allMatches, matches...)
	}

	return allMatches, nil
}

// collectSessionPaths finds all session paths (files and directories) in a
// project directory. It returns top-level .jsonl files plus any UUID-named
// directories that contain subagent data but lack a corresponding .jsonl file.
func collectSessionPaths(projectDir string) ([]string, error) {
	// Find top-level .jsonl files (the traditional format).
	jsonlFiles, err := filepath.Glob(filepath.Join(projectDir, "*.jsonl"))
	if err != nil {
		return nil, err
	}

	// Build a set of session IDs that already have .jsonl files.
	hasJSONL := make(map[string]bool)
	for _, f := range jsonlFiles {
		id := strings.TrimSuffix(filepath.Base(f), ".jsonl")
		hasJSONL[id] = true
	}

	// Look for UUID-named directories that have subagent data but no
	// corresponding .jsonl file.
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		return jsonlFiles, nil // if we can't read the dir, return what we have
	}

	var results []string
	results = append(results, jsonlFiles...)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if hasJSONL[name] || !isSessionUUID(name) {
			continue
		}
		// Check that the directory actually contains subagent JSONL files.
		subagentFiles, _ := filepath.Glob(filepath.Join(projectDir, name, "subagents", "*.jsonl"))
		if len(subagentFiles) > 0 {
			results = append(results, filepath.Join(projectDir, name))
		}
	}

	return results, nil
}

// isSessionUUID returns true if the name looks like a UUID (8-4-4-4-12 hex).
func isSessionUUID(name string) bool {
	// Quick length check: standard UUID is 36 chars (32 hex + 4 dashes).
	if len(name) != 36 {
		return false
	}
	for i, c := range name {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
		} else if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// sessionIDFromPath extracts the session ID from a session file path.
func sessionIDFromPath(path string) string {
	base := filepath.Base(path)
	return strings.TrimSuffix(base, ".jsonl")
}
