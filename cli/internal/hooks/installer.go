package hooks

import "github.com/austinroos/ax/internal/agents"

// Scope identifies which hook installation scope an installer operates on.
type Scope int

const (
	// UserScope covers user-level hooks (e.g. ~/.claude/settings.json).
	UserScope Scope = 1 << iota
	// RepoScope covers repo-local hooks (e.g. .github/hooks/session-end.json).
	RepoScope
)

// Has reports whether s includes the given scope.
func (s Scope) Has(other Scope) bool { return s&other != 0 }

// Installer manages hook installation for a single agent.
type Installer interface {
	// AgentID returns the agent this installer manages hooks for.
	AgentID() agents.AgentID

	// Scopes returns the set of scopes this installer supports.
	Scopes() Scope

	// HomeExists reports whether the agent's home directory is present on this
	// machine — used to skip installers for agents the user doesn't have.
	HomeExists() bool

	// Install writes the hook for the given scope. It is idempotent; calling it
	// when a hook already exists updates it.
	Install(ctx InstallContext) (Installed, error)

	// Uninstall removes the hook written by Install.
	Uninstall(ctx InstallContext) error

	// IsInstalled reports whether an AX hook is already present.
	IsInstalled(ctx InstallContext) bool
}

// InstallContext carries the parameters an installer needs.
type InstallContext struct {
	AxBinary string // absolute path to the ax binary
	HomeDir  string // user home dir, for user-scope installers
	RepoPath string // git repo path, for repo-scope installers
	Scope    Scope  // which scope this call targets
}

// Installed is returned by Install to describe what was written.
type Installed struct {
	Path    string // file path written
	Created bool   // true if AX created it; false if already present + matched
	Message string // human-friendly note for ax init UI
}
