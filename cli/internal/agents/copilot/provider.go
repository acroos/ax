package copilot

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/parsers"
)

func init() {
	agents.Register(New())
}

const id = agents.CopilotCli

// Provider implements agents.Provider for Copilot CLI.
// It also implements agents.RepoEnumerator because workspace.yaml files
// self-describe owner/repo, allowing bulk discovery without a Claude history walk.
type Provider struct{}

// New returns a new Copilot Provider.
func New() *Provider { return &Provider{} }

func (p *Provider) ID() agents.AgentID { return id }

func (p *Provider) HomeDir() string {
	if dir := os.Getenv("COPILOT_HOME"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".copilot")
}

func (p *Provider) HomeExists() bool {
	_, err := os.Stat(p.HomeDir())
	return err == nil
}

func (p *Provider) DiscoverSessions(target agents.DiscoveryTarget) ([]agents.SessionLocator, error) {
	if target.OwnerRepo == "" {
		return nil, nil
	}
	paths, err := findSessionsForRepo(p.HomeDir(), target.OwnerRepo)
	if err != nil {
		return nil, err
	}
	locs := make([]agents.SessionLocator, 0, len(paths))
	for _, path := range paths {
		locs = append(locs, agents.SessionLocator{
			AgentID:   id,
			SessionID: sessionIDFromPath(path),
			Path:      path,
			OwnerRepo: target.OwnerRepo,
		})
	}
	return locs, nil
}

func (p *Provider) Parse(loc agents.SessionLocator) (*parsers.ParsedSession, error) {
	sess, err := parseSession(loc.Path)
	if err != nil {
		return nil, err
	}
	sess.AgentType = string(id)
	return sess, nil
}

func (p *Provider) Capabilities() agents.Capabilities {
	return agents.Registry()[id].Capabilities
}

// DiscoverAllRepos implements agents.RepoEnumerator. It scans workspace.yaml
// files to enumerate every repo Copilot has session data for, without needing
// a Claude history walk.
func (p *Provider) DiscoverAllRepos() ([]agents.RepoLocator, error) {
	workspaces, err := discoverWorkspaces(p.HomeDir())
	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool)
	var repos []agents.RepoLocator
	for _, workspace := range workspaces {
		if workspace.Repository == "" {
			continue
		}
		if seen[workspace.Repository] {
			continue
		}
		seen[workspace.Repository] = true

		parts := strings.SplitN(workspace.Repository, "/", 2)
		if len(parts) != 2 {
			continue
		}
		localPath := workspace.GitRoot
		if localPath == "" {
			localPath = workspace.Cwd
		}
		repos = append(repos, agents.RepoLocator{
			Owner:     parts[0],
			Repo:      parts[1],
			OwnerRepo: workspace.Repository,
			LocalPath: localPath,
		})
	}
	return repos, nil
}

// HomeDirForClaudeDir returns the default Copilot home that sits next to a
// provided Claude home. This keeps bulk discovery testable with temp dirs.
func HomeDirForClaudeDir(claudeDir string) string {
	if dir := os.Getenv("COPILOT_HOME"); dir != "" {
		return dir
	}
	return filepath.Join(filepath.Dir(claudeDir), ".copilot")
}
