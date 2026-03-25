// Package parsers provides data extraction from git, GitHub, and Claude Code sessions.
package parsers

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// GitCommit represents a parsed git commit.
type GitCommit struct {
	SHA          string
	Author       string
	CommittedAt  string // ISO 8601
	Message      string
	Additions    int
	Deletions    int
	FilesChanged int
	IsClaude     bool   // true if Co-Authored-By contains Claude
	Files        []string
}

// GitDiffStat represents line-level change stats for a file.
type GitDiffStat struct {
	File      string
	Additions int
	Deletions int
}

// GitParser extracts data from a git repository.
type GitParser struct {
	repoPath string
}

// NewGitParser creates a parser for the given repository path.
func NewGitParser(repoPath string) *GitParser {
	return &GitParser{repoPath: repoPath}
}

// git runs a git command in the repo directory and returns stdout.
func (g *GitParser) git(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = g.repoPath
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("git %s failed: %s\n%s", strings.Join(args, " "), err, string(exitErr.Stderr))
		}
		return "", fmt.Errorf("git %s failed: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(out)), nil
}

// RemoteURL returns the origin remote URL for the repository.
func (g *GitParser) RemoteURL() (string, error) {
	url, err := g.git("remote", "get-url", "origin")
	if err != nil {
		return "", nil // no remote is fine
	}
	return url, nil
}

// ParseGitHubRemote extracts owner and repo from a GitHub remote URL.
// Supports https://github.com/owner/repo.git and git@github.com:owner/repo.git
func ParseGitHubRemote(remoteURL string) (owner, repo string, err error) {
	if remoteURL == "" {
		return "", "", fmt.Errorf("empty remote URL")
	}

	// Handle SSH URLs: git@github.com:owner/repo.git
	if strings.HasPrefix(remoteURL, "git@github.com:") {
		path := strings.TrimPrefix(remoteURL, "git@github.com:")
		path = strings.TrimSuffix(path, ".git")
		parts := strings.SplitN(path, "/", 2)
		if len(parts) != 2 {
			return "", "", fmt.Errorf("invalid GitHub SSH URL: %s", remoteURL)
		}
		return parts[0], parts[1], nil
	}

	// Handle HTTPS URLs: https://github.com/owner/repo.git
	if strings.Contains(remoteURL, "github.com/") {
		idx := strings.Index(remoteURL, "github.com/")
		path := remoteURL[idx+len("github.com/"):]
		path = strings.TrimSuffix(path, ".git")
		parts := strings.SplitN(path, "/", 2)
		if len(parts) != 2 {
			return "", "", fmt.Errorf("invalid GitHub HTTPS URL: %s", remoteURL)
		}
		return parts[0], parts[1], nil
	}

	return "", "", fmt.Errorf("not a GitHub URL: %s", remoteURL)
}

// RepoRoot returns the absolute path to the repository root.
func (g *GitParser) RepoRoot() (string, error) {
	root, err := g.git("rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	return filepath.Clean(root), nil
}

// ListCommits returns commits in the given range, newest first.
// If since is empty, returns all commits. Branch can be empty for HEAD.
func (g *GitParser) ListCommits(since string, branch string) ([]GitCommit, error) {
	args := []string{"log", "--format=%H%n%an%n%aI%n%B%n---END---", "--numstat"}
	if since != "" {
		args = append(args, "--since="+since)
	}
	if branch != "" {
		args = append(args, branch)
	}

	out, err := g.git(args...)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	return parseCommitLog(out), nil
}

// CommitsOnBranch returns commits on the given branch that are not on the base branch.
func (g *GitParser) CommitsOnBranch(branch, base string) ([]GitCommit, error) {
	args := []string{"log", "--format=%H%n%an%n%aI%n%B%n---END---", "--numstat", base + ".." + branch}
	out, err := g.git(args...)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return parseCommitLog(out), nil
}

// DiffStatBetween returns file-level diff stats between two refs.
func (g *GitParser) DiffStatBetween(base, head string) ([]GitDiffStat, error) {
	out, err := g.git("diff", "--numstat", base+"..."+head)
	if err != nil {
		return nil, err
	}
	return parseNumstat(out), nil
}

// FilesChangedInCommit returns the list of files changed in a commit.
func (g *GitParser) FilesChangedInCommit(sha string) ([]string, error) {
	out, err := g.git("diff-tree", "--no-commit-id", "-r", "--name-only", sha)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return strings.Split(out, "\n"), nil
}

// DefaultBranch returns the default branch name (main or master).
func (g *GitParser) DefaultBranch() (string, error) {
	// Try to get it from remote HEAD
	out, err := g.git("symbolic-ref", "refs/remotes/origin/HEAD", "--short")
	if err == nil && out != "" {
		parts := strings.SplitN(out, "/", 2)
		if len(parts) == 2 {
			return parts[1], nil
		}
		return out, nil
	}

	// Fallback: check if main or master exists
	for _, branch := range []string{"main", "master"} {
		_, err := g.git("rev-parse", "--verify", branch)
		if err == nil {
			return branch, nil
		}
	}

	return "main", nil
}

// parseCommitLog parses the output of git log with our custom format.
func parseCommitLog(output string) []GitCommit {
	var commits []GitCommit
	blocks := strings.Split(output, "---END---")

	for _, block := range blocks {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}

		lines := strings.Split(block, "\n")
		if len(lines) < 3 {
			continue
		}

		commit := GitCommit{
			SHA:         lines[0],
			Author:      lines[1],
			CommittedAt: lines[2],
		}

		// Collect message lines (between date and numstat)
		var msgLines []string
		i := 3
		for ; i < len(lines); i++ {
			line := lines[i]
			// numstat lines start with a digit or -
			if len(line) > 0 && (line[0] >= '0' && line[0] <= '9' || line[0] == '-') {
				parts := strings.Fields(line)
				if len(parts) >= 3 {
					break
				}
			}
			msgLines = append(msgLines, line)
		}
		commit.Message = strings.TrimSpace(strings.Join(msgLines, "\n"))
		commit.IsClaude = strings.Contains(commit.Message, "Co-Authored-By") &&
			strings.Contains(strings.ToLower(commit.Message), "claude")

		// Parse numstat
		for ; i < len(lines); i++ {
			parts := strings.Fields(lines[i])
			if len(parts) >= 3 {
				add, _ := strconv.Atoi(parts[0])
				del, _ := strconv.Atoi(parts[1])
				commit.Additions += add
				commit.Deletions += del
				commit.FilesChanged++
				commit.Files = append(commit.Files, parts[2])
			}
		}

		commits = append(commits, commit)
	}

	return commits
}

// parseNumstat parses git diff --numstat output.
func parseNumstat(output string) []GitDiffStat {
	var stats []GitDiffStat
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 3 {
			add, _ := strconv.Atoi(parts[0])
			del, _ := strconv.Atoi(parts[1])
			stats = append(stats, GitDiffStat{
				File:      parts[2],
				Additions: add,
				Deletions: del,
			})
		}
	}
	return stats
}
