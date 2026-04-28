// Package agents defines the contract every coding-agent integration implements:
// discovery (where sessions live on disk), parsing (turn raw session data into a
// ParsedSession), and a capability declaration.
//
// Per-agent implementations live under agents/<id>/.
package agents

import (
	"github.com/austinroos/ax/internal/parsers"
)

// Provider is the per-agent contract for session discovery and parsing.
type Provider interface {
	// ID returns the wire-format AgentID (also the key in agents.yaml).
	ID() AgentID

	// HomeDir returns the agent's local home directory, honoring the env
	// override declared in agents.yaml.
	HomeDir() string

	// HomeExists reports whether the agent's local state is present.
	// Used to skip uninstalled agents without surfacing errors.
	HomeExists() bool

	// DiscoverSessions returns SessionLocators for sessions matching the target.
	// Implementations decide which target fields they need:
	//   - Claude: needs LocalPath
	//   - Copilot: needs OwnerRepo
	DiscoverSessions(target DiscoveryTarget) ([]SessionLocator, error)

	// Parse turns one SessionLocator into a ParsedSession. The returned session
	// MUST have AgentType set to p.ID().
	Parse(loc SessionLocator) (*parsers.ParsedSession, error)

	// Capabilities returns the static capability declaration for this agent.
	Capabilities() Capabilities
}

// DiscoveryTarget describes "find sessions for this repo" or "find sessions for
// this local path." Different providers need different signals; pass everything
// available, let each provider use what it needs.
type DiscoveryTarget struct {
	OwnerRepo   string     // "owner/repo" — empty for global discovery, populated for ax push --repo
	LocalPath   string     // filesystem path — populated for ax push --repo
	GitRemoteFn GitRemoteFn // resolver for paths → (owner, repo); supplied by caller
}

// GitRemoteFn turns a local repo path into (owner, repo). Cursor uses this
// because it stores only a UUID locally; Claude/Copilot don't need it.
type GitRemoteFn func(localPath string) (owner, repo string, err error)

// SessionLocator is what DiscoverSessions returns for each found session.
type SessionLocator struct {
	AgentID   AgentID
	SessionID string // stable; used by state/dedup logic
	Path      string // file or directory, agent-specific shape
	OwnerRepo string // resolved when known
}

// RepoLocator describes a repo discovered by a RepoEnumerator.
type RepoLocator struct {
	Owner, Repo, OwnerRepo string
	LocalPath              string
}

// RepoEnumerator is an optional interface implemented by providers that can
// self-enumerate repos without a Claude history walk (e.g. Copilot, which
// stores owner/repo in workspace.yaml).
type RepoEnumerator interface {
	DiscoverAllRepos() ([]RepoLocator, error)
}
