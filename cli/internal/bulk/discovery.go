// Package bulk provides repo discovery and bulk push orchestration for ax push --all.
package bulk

import (
	"fmt"
	"os"
	"strings"

	"github.com/austinroos/ax/internal/agents"
	_ "github.com/austinroos/ax/internal/agentinit"
	"github.com/austinroos/ax/internal/parsers"
)

// DiscoveredRepo represents a git repo discovered from Claude Code history.
type DiscoveredRepo struct {
	Owner          string
	Repo           string
	OwnerRepo      string             // "owner/repo" display string
	ProjectPaths   []string           // all filesystem paths mapping to this repo
	SessionLocators []agents.SessionLocator // deduplicated session locators
}

// SessionFiles returns the paths from all SessionLocators for backward compat with push.go.
func (d *DiscoveredRepo) SessionFiles() []string {
	paths := make([]string, 0, len(d.SessionLocators))
	for _, loc := range d.SessionLocators {
		paths = append(paths, loc.Path)
	}
	return paths
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
		history = map[string][]parsers.HistoryEntry{} // no Claude history = still discover Copilot sessions
	}

	projectPaths := uniqueProjectPaths(history)

	// Resolve each project path to its repo root, then to owner/repo.
	// Multiple paths can map to the same owner/repo.
	type repoKey struct{ owner, repo string }
	repoGroups := make(map[repoKey]*DiscoveredRepo)
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
		if _, ok := repoGroups[key]; !ok {
			repoGroups[key] = &DiscoveredRepo{
				Owner:        owner,
				Repo:         repo,
				OwnerRepo:    owner + "/" + repo,
				ProjectPaths: []string{path},
			}
		} else {
			repoGroups[key].ProjectPaths = append(repoGroups[key].ProjectPaths, path)
		}
		// Also include the resolved root if it differs, so worktree sessions
		// are discovered by findSessionFiles' glob pattern.
		if resolved != path {
			repoGroups[key].ProjectPaths = append(repoGroups[key].ProjectPaths, resolved)
		}
	}

	// For providers that can self-enumerate repos (e.g. Copilot), fold in
	// any repos not yet found via Claude history.
	for _, p := range agents.RegisteredProviders() {
		enum, ok := p.(agents.RepoEnumerator)
		if !ok {
			continue
		}
		repos, err := enum.DiscoverAllRepos()
		if err != nil {
			continue
		}
		for _, r := range repos {
			owner, repo := r.Owner, r.Repo
			if r.OwnerRepo != "" {
				parts := strings.SplitN(r.OwnerRepo, "/", 2)
				if len(parts) != 2 {
					continue
				}
				owner, repo = parts[0], parts[1]
			} else if r.LocalPath != "" {
				o, rp, err := gitRemoteFn(r.LocalPath)
				if err != nil {
					continue
				}
				owner, repo = o, rp
			} else {
				continue
			}
			key := repoKey{owner: owner, repo: repo}
			if _, ok := repoGroups[key]; !ok {
				repoGroups[key] = &DiscoveredRepo{
					Owner:        owner,
					Repo:         repo,
					OwnerRepo:    owner + "/" + repo,
					ProjectPaths: []string{r.LocalPath},
				}
			}
		}
	}

	// For each repo group, discover and deduplicate session locators via providers.
	var repos []DiscoveredRepo
	totalSessions := 0

	for _, dr := range repoGroups {
		seen := make(map[string]bool)
		var locs []agents.SessionLocator

		// Deduplicate the project paths.
		seenPaths := make(map[string]bool)
		for _, path := range dr.ProjectPaths {
			if seenPaths[path] {
				continue
			}
			seenPaths[path] = true

			target := agents.DiscoveryTarget{
				OwnerRepo:   dr.OwnerRepo,
				LocalPath:   path,
				GitRemoteFn: agents.GitRemoteFn(gitRemoteFn),
			}
			for _, p := range agents.RegisteredProviders() {
				if !p.HomeExists() {
					continue
				}
				provLocs, err := p.DiscoverSessions(target)
				if err != nil {
					continue
				}
				for _, loc := range provLocs {
					if seen[loc.SessionID] {
						continue
					}
					seen[loc.SessionID] = true
					locs = append(locs, loc)
				}
			}
		}

		if len(locs) == 0 {
			continue
		}

		// Deduplicate project paths for display.
		uniquePaths := make([]string, 0, len(seenPaths))
		for p := range seenPaths {
			uniquePaths = append(uniquePaths, p)
		}

		repos = append(repos, DiscoveredRepo{
			Owner:           dr.Owner,
			Repo:            dr.Repo,
			OwnerRepo:       dr.OwnerRepo,
			ProjectPaths:    uniquePaths,
			SessionLocators: locs,
		})
		totalSessions += len(locs)
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
