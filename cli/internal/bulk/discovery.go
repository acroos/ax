// Package bulk provides repo discovery and bulk push orchestration for ax push --all.
package bulk

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/parsers"
)

// RemoteInfo holds the parsed identity of a git remote URL.
type RemoteInfo struct {
	Platform string // "github" or "gitlab"
	Owner    string // org/namespace
	Repo     string // repo/project name
}

// DiscoveredRepo represents a git repo discovered from Claude Code history.
type DiscoveredRepo struct {
	Platform     string   // "github" or "gitlab"
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

// GitRemoteFn resolves a filesystem path to remote info via git remote.
type GitRemoteFn func(path string) (RemoteInfo, error)

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
	type repoKey struct{ platform, owner, repo string }
	repoGroups := make(map[repoKey][]string) // platform/owner/repo -> project paths
	var skipped []SkippedPath

	for _, path := range projectPaths {
		resolved := ResolveWorktreePath(path)

		if _, err := os.Stat(resolved); os.IsNotExist(err) {
			skipped = append(skipped, SkippedPath{Path: path, Reason: "directory not found"})
			continue
		}

		info, err := gitRemoteFn(resolved)
		if err != nil {
			skipped = append(skipped, SkippedPath{Path: path, Reason: fmt.Sprintf("no git remote: %v", err)})
			continue
		}

		key := repoKey{info.Platform, info.Owner, info.Repo}
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
			Platform:     key.platform,
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

// ParseGitRemote extracts platform, owner, and repo from a git remote URL.
// Supports both SSH (git@github.com:owner/repo.git) and HTTPS formats.
// Detects platform from hostname: github.com → "github", gitlab.com → "gitlab".
func ParseGitRemote(remoteURL string) (RemoteInfo, error) {
	var host, owner, repo string

	// Handle SSH URLs: git@github.com:owner/repo.git
	if strings.HasPrefix(remoteURL, "git@") {
		parts := strings.SplitN(remoteURL, ":", 2)
		if len(parts) != 2 {
			return RemoteInfo{}, fmt.Errorf("cannot parse SSH remote: %s", remoteURL)
		}
		host = strings.TrimPrefix(parts[0], "git@")
		path := strings.TrimSuffix(parts[1], ".git")
		segments := strings.Split(path, "/")
		if len(segments) >= 2 {
			owner = segments[len(segments)-2]
			repo = segments[len(segments)-1]
		}
	} else {
		// Handle HTTPS URLs: https://github.com/owner/repo.git
		trimmed := strings.TrimSuffix(remoteURL, ".git")
		parts := strings.Split(trimmed, "/")
		if len(parts) >= 5 {
			// https://github.com/owner/repo → parts: [https:, , github.com, owner, repo]
			host = parts[2]
			owner = parts[len(parts)-2]
			repo = parts[len(parts)-1]
		}
	}

	if owner == "" || repo == "" {
		return RemoteInfo{}, fmt.Errorf("cannot parse remote URL: %s", remoteURL)
	}

	return RemoteInfo{
		Platform: detectPlatform(host),
		Owner:    owner,
		Repo:     repo,
	}, nil
}

// detectPlatform returns the platform name based on the git host.
func detectPlatform(host string) string {
	switch {
	case strings.Contains(host, "gitlab"):
		return "gitlab"
	default:
		return "github"
	}
}
