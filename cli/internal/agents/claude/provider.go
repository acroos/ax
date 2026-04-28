package claude

import (
	"os"
	"path/filepath"

	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/parsers"
)

func init() {
	agents.Register(New())
}

const id = agents.ClaudeCode

// Provider implements agents.Provider for Claude Code.
type Provider struct{}

// New returns a new Claude Provider.
func New() *Provider { return &Provider{} }

func (p *Provider) ID() agents.AgentID { return id }

func (p *Provider) HomeDir() string {
	if dir := os.Getenv("AX_CLAUDE_HOME"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude")
}

func (p *Provider) HomeExists() bool {
	_, err := os.Stat(p.HomeDir())
	return err == nil
}

func (p *Provider) DiscoverSessions(target agents.DiscoveryTarget) ([]agents.SessionLocator, error) {
	if target.LocalPath == "" {
		return nil, nil
	}
	paths, err := findSessionFiles(p.HomeDir(), target.LocalPath)
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
