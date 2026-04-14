// Package bulk provides repo discovery and bulk push orchestration for ax push --all.
package bulk

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/parsers"
)

// DiscoveredRepo represents a git repo discovered from Claude Code history.
type DiscoveredRepo struct {
	Owner        string
	Repo         string
	OwnerRepo    string   // "owner/repo" display string
	ProjectPaths []string // all filesystem paths mapping to this repo
	SessionFiles []string // deduplicated session .jsonl file paths
}

// DiscoverySummary holds the result of scanning history.jsonl.
type DiscoverySummary struct {
	Repos         []DiscoveredRepo
	TotalSessions int
	SkippedPaths  []SkippedPath
}

// SkippedPath records a project path that couldn't be resolved to a repo.
type SkippedPath struct {
	Path   string
	Reason string
}

// GitRemoteFn resolves a filesystem path to (owner, repo) via git remote.
type GitRemoteFn func(path string) (owner, repo string, err error)

// DiscoverRepos scans history.jsonl and returns all repos with their sessions.
func DiscoverRepos(claudeDir string, gitRemoteFn GitRemoteFn) (*DiscoverySummary, error) {
	history, err := parsers.LoadHistory(claudeDir)
	if err != nil {
		return &DiscoverySummary{}, nil // no history = no repos, not an error
	}

	projectPaths := uniqueProjectPaths(history)
	if len(projectPaths) == 0 {
		return &DiscoverySummary{}, nil
	}

	// Resolve each project path to its repo root, then to owner/repo.
	// Multiple paths can map to the same owner/repo.
	type repoKey struct{ owner, repo string }
	repoGroups := make(map[repoKey][]string) // owner/repo -> project paths
	var skipped []SkippedPath

	for _, path := range projectPaths {
		resolved := ResolveWorktreePath(path)

		if _, err := os.Stat(resolved); os.IsNotExist(err) {
			skipped = append(skipped, SkippedPath{Path: path, Reason: "directory not found"})
			continue
		}

		owner, repo, err := gitRemoteFn(resolved)
		if err != nil {
			skipped = append(skipped, SkippedPath{Path: path, Reason: fmt.Sprintf("no git remote: %v", err)})
			continue
		}

		key := repoKey{owner, repo}
		// Store the original path (not resolved) so FindSessionFiles looks
		// in the correct encoded directory for subdirs and worktrees.
		repoGroups[key] = append(repoGroups[key], path)
		// Also include the resolved root if it differs, so worktree sessions
		// are discovered by FindSessionFiles' glob pattern.
		if resolved != path {
			repoGroups[key] = append(repoGroups[key], resolved)
		}
	}

	// For each repo group, discover and deduplicate session files.
	var repos []DiscoveredRepo
	totalSessions := 0

	for key, paths := range repoGroups {
		sessionSet := make(map[string]string) // basename -> full path

		// Deduplicate the paths themselves first.
		seen := make(map[string]bool)
		for _, p := range paths {
			if seen[p] {
				continue
			}
			seen[p] = true

			files, err := parsers.FindSessionFiles(claudeDir, p)
			if err != nil {
				continue
			}
			for _, f := range files {
				base := filepath.Base(f)
				if _, exists := sessionSet[base]; !exists {
					sessionSet[base] = f
				}
			}
		}

		if len(sessionSet) == 0 {
			continue
		}

		sessionFiles := make([]string, 0, len(sessionSet))
		for _, f := range sessionSet {
			sessionFiles = append(sessionFiles, f)
		}

		// Deduplicate project paths for display.
		uniquePaths := make([]string, 0, len(seen))
		for p := range seen {
			uniquePaths = append(uniquePaths, p)
		}

		repos = append(repos, DiscoveredRepo{
			Owner:        key.owner,
			Repo:         key.repo,
			OwnerRepo:    key.owner + "/" + key.repo,
			ProjectPaths: uniquePaths,
			SessionFiles: sessionFiles,
		})
		totalSessions += len(sessionFiles)
	}

	return &DiscoverySummary{
		Repos:         repos,
		TotalSessions: totalSessions,
		SkippedPaths:  skipped,
	}, nil
}

// ResolveWorktreePath strips /.claude/worktrees/<name> suffix to get the parent repo path.
// Returns the original path if it's not a worktree path.
func ResolveWorktreePath(path string) string {
	const marker = "/.claude/worktrees/"
	if idx := strings.Index(path, marker); idx > 0 {
		return path[:idx]
	}
	return path
}

// uniqueProjectPaths extracts deduplicated project paths from history entries,
// filtering out empty paths.
func uniqueProjectPaths(sessions map[string][]parsers.HistoryEntry) []string {
	seen := make(map[string]bool)
	var paths []string

	for _, entries := range sessions {
		for _, e := range entries {
			if e.Project == "" {
				continue
			}
			if !seen[e.Project] {
				seen[e.Project] = true
				paths = append(paths, e.Project)
			}
		}
	}
	return paths
}

// ParseGitRemote extracts owner/repo from a GitHub remote URL.
// Supports both SSH (git@github.com:owner/repo.git) and HTTPS formats.
func ParseGitRemote(remoteURL string) (owner, repo string, err error) {
	// Handle SSH URLs: git@github.com:owner/repo.git
	if strings.HasPrefix(remoteURL, "git@") {
		parts := strings.SplitN(remoteURL, ":", 2)
		if len(parts) != 2 {
			return "", "", fmt.Errorf("cannot parse SSH remote: %s", remoteURL)
		}
		path := strings.TrimSuffix(parts[1], ".git")
		segments := strings.Split(path, "/")
		if len(segments) >= 2 {
			return segments[len(segments)-2], segments[len(segments)-1], nil
		}
	}

	// Handle HTTPS URLs: https://github.com/owner/repo.git
	remoteURL = strings.TrimSuffix(remoteURL, ".git")
	parts := strings.Split(remoteURL, "/")
	if len(parts) >= 2 {
		return parts[len(parts)-2], parts[len(parts)-1], nil
	}

	return "", "", fmt.Errorf("cannot parse remote URL: %s", remoteURL)
}
