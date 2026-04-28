package cursor

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/parsers"
)

func init() {
	agents.Register(New())
}

const id = agents.CursorCli

// Provider implements agents.Provider for Cursor CLI.
// It also implements agents.RepoEnumerator because Cursor stores project
// directories under ~/.cursor/projects/<encoded-path>/, allowing bulk
// discovery by walking that tree.
type Provider struct{}

// New returns a new Cursor Provider.
func New() *Provider { return &Provider{} }

func (p *Provider) ID() agents.AgentID { return id }

func (p *Provider) HomeDir() string {
	if dir := os.Getenv("CURSOR_HOME"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".cursor")
}

func (p *Provider) HomeExists() bool {
	_, err := os.Stat(p.HomeDir())
	return err == nil
}

func (p *Provider) DiscoverSessions(target agents.DiscoveryTarget) ([]agents.SessionLocator, error) {
	if target.LocalPath == "" {
		return nil, nil
	}
	encoded := encodePath(target.LocalPath)
	transcriptsDir := filepath.Join(p.HomeDir(), "projects", encoded, "agent-transcripts")
	entries, err := os.ReadDir(transcriptsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var locs []agents.SessionLocator
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		agentUUID := ent.Name()
		transcriptPath := filepath.Join(transcriptsDir, agentUUID, agentUUID+".jsonl")
		if _, err := os.Stat(transcriptPath); err != nil {
			continue
		}
		locs = append(locs, agents.SessionLocator{
			AgentID:   id,
			SessionID: agentUUID,
			Path:      transcriptPath,
			OwnerRepo: target.OwnerRepo,
		})
	}
	return locs, nil
}

func (p *Provider) Parse(loc agents.SessionLocator) (*parsers.ParsedSession, error) {
	sess, err := parseTranscript(loc.Path, loc.SessionID)
	if err != nil {
		return nil, err
	}
	sess.AgentType = string(id)

	// Enrich with AI tracking data (commit attribution + conversation summary).
	// This is best-effort: if the DB is absent or the fetch fails, we continue
	// without extras rather than failing the whole parse.
	extras, extrasErr := fetchExtras(p.HomeDir(), loc.SessionID, sess.StartedAt, sess.EndedAt)
	if extrasErr != nil {
		log.Printf("cursor: extras enrichment failed for session %s: %v", loc.SessionID, extrasErr)
	} else if len(extras) > 0 {
		sess.Extras = extras
	}

	return sess, nil
}

func (p *Provider) Capabilities() agents.Capabilities {
	return agents.Registry()[id].Capabilities
}

// DiscoverAllRepos implements agents.RepoEnumerator. It walks ~/.cursor/projects/
// and derives the workspace path for each project, preferring .workspace-trusted
// JSON over the (approximate) decoded directory name.
func (p *Provider) DiscoverAllRepos() ([]agents.RepoLocator, error) {
	projectsRoot := filepath.Join(p.HomeDir(), "projects")
	entries, err := os.ReadDir(projectsRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var repos []agents.RepoLocator
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}

		// Prefer .workspace-trusted JSON's workspacePath; it's authoritative.
		// Fall back to decoding the directory name only when the file is missing.
		// The decoded fallback is approximate — directory names with hyphens are
		// ambiguous — so callers must handle GitRemoteFn failure gracefully.
		localPath := resolveProjectPath(projectsRoot, ent.Name())
		if localPath == "" {
			continue
		}

		repos = append(repos, agents.RepoLocator{LocalPath: localPath})
	}
	return repos, nil
}

// resolveProjectPath returns the workspace path for a project directory.
// It reads .workspace-trusted first; if that fails, it decodes the directory
// name as a fallback (leading "-" prepended, "-" → "/").
func resolveProjectPath(projectsRoot, dirName string) string {
	wsFile := filepath.Join(projectsRoot, dirName, ".workspace-trusted")
	if data, err := os.ReadFile(wsFile); err == nil {
		var ws workspaceTrusted
		if jsonUnmarshal(data, &ws) == nil && ws.WorkspacePath != "" {
			return ws.WorkspacePath
		}
	}
	// Fallback: decode directory name. This is approximate — hyphens in path
	// components are indistinguishable from the path separator after encoding.
	// Prefer .workspace-trusted when available.
	if dirName == "" {
		return ""
	}
	return "/" + strings.ReplaceAll(dirName, "-", "/")
}

// encodePath encodes an absolute path for Cursor's projects directory.
// Cursor strips the leading "/" and replaces remaining "/" with "-".
// This is DIFFERENT from Claude's encoding, which also replaces "." with "-"
// and uses a different prefix convention.
//
// Example:
//
//	Claude: /Users/foo/dev/ax → -Users-foo-dev-ax (dots also → -)
//	Cursor: /Users/foo/dev/ax → Users-foo-dev-ax  (dots preserved)
func encodePath(absPath string) string {
	p := strings.TrimPrefix(absPath, "/")
	return strings.ReplaceAll(p, "/", "-")
}
