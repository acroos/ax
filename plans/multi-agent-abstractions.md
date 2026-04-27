# Plan: Plug-and-Play Agent Provider System

Plan date: 2026-04-27.
Predecessor research: [`research/multi-agent-abstractions.md`](research/multi-agent-abstractions.md).
Supersedes earlier scoping in [`multi-harness-multi-provider.md`](multi-harness-multi-provider.md) (out of date for several findings — written before Copilot CLI shipped).

This plan is written to be **implementable by Sonnet sub-agents**. Each phase includes exact file paths, code sketches, test patterns, exit criteria, common gotchas, and a delegation prompt template at the end. Read end-to-end before starting Phase 1; the phases reference each other.

---

## Table of contents

- [Context](#context)
- [Decisions locked in](#decisions-locked-in)
- [Glossary and conventions](#glossary-and-conventions)
- [Architecture overview](#architecture-overview)
- [The single source of truth: `config/agents.yaml`](#the-single-source-of-truth-configagentsyaml)
- [Codegen pipeline](#codegen-pipeline)
- [Provider interface (Go)](#provider-interface-go)
- [Capability matrix wiring](#capability-matrix-wiring)
- [Wire-format versioning](#wire-format-versioning)
- [Hook installer interface](#hook-installer-interface)
- [Schema changes (full migration code)](#schema-changes-full-migration-code)
- [The seven surfaces — change matrix](#the-seven-surfaces--change-matrix)
- [Phased roadmap](#phased-roadmap)
  - [Phase 1 — Agent registry + codegen pipeline](#phase-1--agent-registry--codegen-pipeline)
  - [Phase 2 — Wire-format versioning + capability declarations](#phase-2--wire-format-versioning--capability-declarations)
  - [Phase 3 — Provider interface refactor (Go)](#phase-3--provider-interface-refactor-go)
  - [Phase 4 — Server: capability-aware push validation + aggregator](#phase-4--server-capability-aware-push-validation--aggregator)
  - [Phase 5 — Dashboard: capability-aware filter + NULL rendering](#phase-5--dashboard-capability-aware-filter--null-rendering)
  - [Phase 6 — Hook installer interface refactor](#phase-6--hook-installer-interface-refactor)
  - [Phase 7 — Cursor provider](#phase-7--cursor-provider)
  - [Phase 8 — Cursor extras (commit attribution + summary)](#phase-8--cursor-extras-commit-attribution--summary)
  - [Phase 9 — Documentation + ADR](#phase-9--documentation--adr)
- [Cross-cutting concerns](#cross-cutting-concerns)
- [Testing strategy](#testing-strategy)
- [Resolved tactical decisions](#resolved-tactical-decisions)
- [Risks](#risks)
- [Out of scope](#out-of-scope)
- [Related decisions](#related-decisions)
- [Deliverables](#deliverables)

---

## Context

After PR #232, AX has two integrated agents: Claude Code and Copilot CLI. The research doc identified seven abstraction surfaces where adding a third agent currently means an edit-everywhere churn:

1. **Agent identity** — string literal duplicated in 11 places
2. **Session discovery** — per-agent functions called sequentially
3. **Session parsing** — dispatcher with a hardcoded sniff
4. **Tool taxonomy** — each parser hardcodes its agent's tool names
5. **Metric availability per agent** — ad-hoc `nil`-vs-zero in two places
6. **Hook installation** — two unrelated installers, different scopes
7. **Repo identity from local state** — each agent has a different relationship between session and repo

Plus an eighth surface (pricing/token semantics) that's currently sidestepped by removing dollar costs.

This plan converts those findings into actionable work, using **Cursor as the forcing-function third agent** so the abstractions are validated by a real new integration instead of designed in the abstract.

## Decisions locked in

1. **Forcing-function with Cursor.** Abstractions and the third-agent integration ship together.
2. **Single codegen-driven agent registry.** One file (`config/agents.yaml`) is the source of truth. Codegen produces Go consts, Ruby module, TypeScript types/labels, plus a SQL fixture. Adding an agent edits one file.
3. **Statically declared capability matrix.** Each agent declares which fields and metrics it supplies up front in `agents.yaml`. Push validation, aggregator filtering, dashboard NULL rendering, and per-metric agent-filter visibility all read from this declared matrix.

## Glossary and conventions

| Term | Meaning |
|---|---|
| **Agent** | A coding harness that produces session data (Claude Code, Copilot CLI, Cursor CLI, etc.). Identified by an `agent_id` string. |
| **Provider** | The Go implementation of `agents.Provider` for a single agent — discovery + parsing. |
| **Installer** | The Go implementation of `hooks.Installer` for a single agent — install/uninstall hooks. |
| **Capability** | A boolean declaring "this agent supplies this field" or "supports this metric." Lives in `agents.yaml`. |
| **Registry** | The set of all agents loaded from `agents.yaml`, exposed in each language as generated code. |
| **`*.gen.*` file** | Codegen output. Header marks it `Code generated — DO NOT EDIT.` Hand-edits will be flagged in CI. |
| **Forcing function** | Cursor — the third agent that breaks every existing assumption and validates the abstractions. |
| **Phase** | A shippable unit of work with its own exit criteria. Phases 1–6 are behavior-preserving for Claude/Copilot users. |

**Path conventions used throughout**:

- Repo root (worktree): `/Users/austinroos/dev/ax/.claude/worktrees/multi-agent-abstractions-plan/`. Sub-agents must use absolute paths and not `cd`.
- Go module: `github.com/austinroos/ax`. Import paths like `github.com/austinroos/ax/internal/agents`.
- Rails app: `server/` — Rails 8, RSpec for tests.
- Dashboard: `dashboard/` — Next.js 16 App Router, Tailwind v4, shadcn/ui.

**Project rule** (from CLAUDE.md): the demo app under `dashboard/src/app/demo/` mirrors real app functionality. Any user-visible change in real pages **must** have a matching change in the demo. The demo uses mock data from `dashboard/src/lib/mock/data.ts`.

---

## Architecture overview

Three artifacts make this work:

1. **`config/agents.yaml`** — declarative agent + capability registry.
2. **Codegen pipeline** — emits `*.gen.*` files for Go, Ruby, TypeScript, plus a plain-text SQL fixture.
3. **Provider/Installer interfaces in Go** — give the CLI a single iteration point for discovery, parsing, and hook install.

Data flow becomes:

```
agents.yaml ──(codegen)──┬── cli/internal/agents/registry.gen.go
                         ├── server/app/models/agent_registry.rb
                         ├── dashboard/src/lib/agents.gen.ts
                         └── server/db/agent_types.txt   (loaded by Rails validation)

CLI push:                         Server ingest:                  Dashboard render:
  for p in providers:                AgentRegistry.supports_field?    AGENT_LABELS[id]
    p.DiscoverSessions               PushService.upsert_sessions       agentSupportsMetric(id, slug)
    p.Parse                          MetricsAggregator (filtered)      <AgentTypeFilter />
    payload.append                                                     metric NULL → "N/A"
```

---

## The single source of truth: `config/agents.yaml`

Path: `/Users/austinroos/dev/ax/.claude/worktrees/multi-agent-abstractions-plan/config/agents.yaml`

Full file (this is the artifact Phase 1 commits — Cursor entry is added in Phase 7):

```yaml
# config/agents.yaml — single source of truth for agent registry + capability matrix.
# Codegen target: cli/internal/agents/registry.gen.go,
#                 server/app/models/agent_registry.rb,
#                 dashboard/src/lib/agents.gen.ts,
#                 server/db/agent_types.txt.
# After editing, run: just codegen-agents
# CI verifies via: just codegen-agents-check

schema_version: 1

# All field names available to capability declarations. The codegen validates
# that every agent's `fields:` map uses only keys from this list.
field_keys:
  - input_tokens
  - output_tokens
  - cache_creation_input_tokens
  - cache_read_input_tokens
  - sidechain_messages
  - peak_context_pct
  - total_file_reads
  - total_tool_calls
  - agent_tool_calls
  - skill_tool_calls
  - mcp_tool_calls

# All metric slugs. Codegen validates `metrics:` keys against this list.
# Mirrors MetricsAggregator slugs in server/app/services/metrics_aggregator.rb.
metric_slugs:
  - iteration-depth
  - cache-hit-rate
  - sidechain-rate
  - peak-context-pct
  - re-read-rate
  - autonomy-score
  - skill-tool-usage
  - subagent-delegation
  - token-cost-per-pr

agents:
  claude_code:
    label: Claude Code
    color: "#c4621a"            # Parchment & Clay accent; verify against ADR-015 palette
    home_dir_env: AX_CLAUDE_HOME
    home_dir_default: ~/.claude
    hook_scopes: [user]
    fields:
      input_tokens: true
      output_tokens: true
      cache_creation_input_tokens: true
      cache_read_input_tokens: true
      sidechain_messages: true
      peak_context_pct: true
      total_file_reads: true
      total_tool_calls: true
      agent_tool_calls: true
      skill_tool_calls: true
      mcp_tool_calls: true
    metrics:
      iteration-depth: true
      cache-hit-rate: true
      sidechain-rate: true
      peak-context-pct: true
      re-read-rate: true
      autonomy-score: true
      skill-tool-usage: true
      subagent-delegation: true
      token-cost-per-pr: true

  copilot_cli:
    label: Copilot CLI
    color: "#5a8fd8"
    home_dir_env: COPILOT_HOME
    home_dir_default: ~/.copilot
    hook_scopes: [repo]
    fields:
      input_tokens: true            # session-aggregate, not per-message
      output_tokens: true
      cache_creation_input_tokens: true
      cache_read_input_tokens: true
      sidechain_messages: false
      peak_context_pct: false
      total_file_reads: true
      total_tool_calls: true
      agent_tool_calls: true        # via "task" tool
      skill_tool_calls: false
      mcp_tool_calls: true
    metrics:
      iteration-depth: true
      cache-hit-rate: true
      sidechain-rate: false
      peak-context-pct: false
      re-read-rate: true
      autonomy-score: true
      skill-tool-usage: false       # mcp only, no skill tool
      subagent-delegation: true
      token-cost-per-pr: true
```

Cursor entry (added in Phase 7):

```yaml
  cursor_cli:
    label: Cursor CLI
    color: "#5a7a5a"
    home_dir_env: CURSOR_HOME
    home_dir_default: ~/.cursor
    hook_scopes: [user, repo]
    fields:
      input_tokens: false
      output_tokens: false
      cache_creation_input_tokens: false
      cache_read_input_tokens: false
      sidechain_messages: false
      peak_context_pct: false
      total_file_reads: true
      total_tool_calls: true
      agent_tool_calls: false
      skill_tool_calls: false
      mcp_tool_calls: false
    metrics:
      iteration-depth: true
      cache-hit-rate: false
      sidechain-rate: false
      peak-context-pct: false
      re-read-rate: true
      autonomy-score: true
      skill-tool-usage: false
      subagent-delegation: false
      token-cost-per-pr: false
```

**YAML hand-edit invariants** the codegen script enforces:

- `agents.<id>` must be a valid Ruby/Go/TS identifier in lowercase snake_case.
- Every agent must declare every key listed in `field_keys` (no implicit defaults).
- Every agent must declare every key listed in `metric_slugs`.
- `color` must be a 7-char hex string.
- `hook_scopes` must be a non-empty subset of `[user, repo]`.

A schema-violation in `agents.yaml` aborts codegen with a clear error pointing at the offending line.

---

## Codegen pipeline

### Layout

```
config/
  agents.yaml                     # source of truth (hand-edited)
scripts/
  codegen-agents/
    generate.rb                   # entrypoint
    templates/
      registry.go.erb
      agent_registry.rb.erb
      agents.ts.erb
      agent_types.txt.erb
    schema.rb                     # YAML validation logic (separate file for testability)
    spec/
      generate_spec.rb            # tests the codegen itself
```

### `scripts/codegen-agents/generate.rb` (script entrypoint)

```ruby
#!/usr/bin/env ruby
# Usage:
#   ruby scripts/codegen-agents/generate.rb           # writes outputs
#   ruby scripts/codegen-agents/generate.rb --check   # exits non-zero if outputs differ from disk

require "yaml"
require "erb"
require "fileutils"
require "digest"
require_relative "schema"

ROOT = File.expand_path("../..", __dir__)
SOURCE = File.join(ROOT, "config/agents.yaml")
TEMPLATES = File.join(__dir__, "templates")

OUTPUTS = {
  "registry.go.erb"        => "cli/internal/agents/registry.gen.go",
  "agent_registry.rb.erb"  => "server/app/models/agent_registry.rb",
  "agents.ts.erb"          => "dashboard/src/lib/agents.gen.ts",
  "agent_types.txt.erb"    => "server/db/agent_types.txt"
}

def render(template_name, binding_obj)
  template = File.read(File.join(TEMPLATES, template_name))
  ERB.new(template, trim_mode: "-").result(binding_obj)
end

check_only = ARGV.include?("--check")

raw = YAML.safe_load_file(SOURCE)
Schema.validate!(raw)                                 # raises with line number on violation

agents = raw["agents"]
field_keys = raw["field_keys"]
metric_slugs = raw["metric_slugs"]
schema_version = raw["schema_version"]

binding_obj = OpenStruct.new(
  agents: agents,
  field_keys: field_keys,
  metric_slugs: metric_slugs,
  schema_version: schema_version,
  source_path: "config/agents.yaml"
).instance_eval { binding }

drift = []
OUTPUTS.each do |template, target|
  rendered = render(template, binding_obj)
  abs = File.join(ROOT, target)
  existing = File.exist?(abs) ? File.read(abs) : nil
  if check_only
    drift << target if existing != rendered
  else
    FileUtils.mkdir_p(File.dirname(abs))
    File.write(abs, rendered)
    puts "wrote #{target}"
  end
end

if check_only && drift.any?
  warn "Generated files are out of date:"
  drift.each { |t| warn "  - #{t}" }
  warn "Run: just codegen-agents"
  exit 1
end
```

### `scripts/codegen-agents/schema.rb` (validation)

Validates the invariants listed above. Raises `Schema::Error` with message + offending key on violation. Tested in `spec/generate_spec.rb`.

### Template: `templates/registry.go.erb`

```erb
// Code generated by scripts/codegen-agents — DO NOT EDIT.
// Source: <%= source_path %>

package agents

// AgentID is the wire-format identifier for an agent.
type AgentID string

const (
<% agents.each do |id, _| -%>
    <%= id.split("_").map(&:capitalize).join %> AgentID = "<%= id %>"
<% end -%>
)

// AllAgents is the set of every agent registered in agents.yaml.
var AllAgents = []AgentID{
<% agents.each do |id, _| -%>
    "<%= id %>",
<% end -%>
}

// Capabilities declares which fields and metrics an agent supplies.
type Capabilities struct {
    Fields  map[string]bool
    Metrics map[string]bool
}

// Metadata is the static, dashboard-relevant info for an agent.
type Metadata struct {
    ID            AgentID
    Label         string
    Color         string        // 7-char hex including #
    HomeDirEnv    string
    HomeDirDefault string
    HookScopes    []string      // "user", "repo"
    Capabilities  Capabilities
}

// Registry returns the full agent registry indexed by AgentID.
func Registry() map[AgentID]Metadata {
    return map[AgentID]Metadata{
<% agents.each do |id, meta| -%>
        "<%= id %>": {
            ID:             "<%= id %>",
            Label:          <%= meta["label"].dump %>,
            Color:          <%= meta["color"].dump %>,
            HomeDirEnv:     <%= meta["home_dir_env"].dump %>,
            HomeDirDefault: <%= meta["home_dir_default"].dump %>,
            HookScopes:     []string{<%= meta["hook_scopes"].map(&:dump).join(", ") %>},
            Capabilities: Capabilities{
                Fields: map[string]bool{
<% field_keys.each do |k| -%>
                    "<%= k %>": <%= meta["fields"][k] %>,
<% end -%>
                },
                Metrics: map[string]bool{
<% metric_slugs.each do |s| -%>
                    "<%= s %>": <%= meta["metrics"][s] %>,
<% end -%>
                },
            },
        },
<% end -%>
    }
}

// Valid reports whether id is a known AgentID.
func Valid(id AgentID) bool {
    _, ok := Registry()[id]
    return ok
}
```

### Template: `templates/agent_registry.rb.erb`

```erb
# Code generated by scripts/codegen-agents — DO NOT EDIT.
# Source: <%= source_path %>

module AgentRegistry
  AGENTS = {
<% agents.each do |id, meta| -%>
    "<%= id %>" => {
      label: <%= meta["label"].inspect %>,
      color: <%= meta["color"].inspect %>,
      home_dir_env: <%= meta["home_dir_env"].inspect %>,
      home_dir_default: <%= meta["home_dir_default"].inspect %>,
      hook_scopes: <%= meta["hook_scopes"].inspect %>,
      fields: {
<% raw["field_keys"].each do |k| -%>
        <%= k %>: <%= meta["fields"][k] %>,
<% end -%>
      },
      metrics: {
<% raw["metric_slugs"].each do |s| -%>
        "<%= s %>" => <%= meta["metrics"][s] %>,
<% end -%>
      }
    },
<% end -%>
  }.freeze

  VALID_IDS = AGENTS.keys.freeze

  def self.valid?(id)
    AGENTS.key?(id.to_s)
  end

  def self.supports_field?(id, field)
    !!AGENTS.dig(id.to_s, :fields, field.to_sym)
  end

  def self.supports_metric?(id, slug)
    !!AGENTS.dig(id.to_s, :metrics, slug.to_s)
  end

  def self.metric_supported_by_any?(slug)
    AGENTS.any? { |_, meta| meta[:metrics][slug.to_s] }
  end

  def self.agents_supporting_metric(slug)
    AGENTS.select { |_, meta| meta[:metrics][slug.to_s] }.keys
  end

  def self.label(id)
    AGENTS.dig(id.to_s, :label) || id.to_s
  end

  def self.color(id)
    AGENTS.dig(id.to_s, :color)
  end
end
```

> **Note**: the ERB references `raw["field_keys"]` — pass `raw` into the binding alongside the destructured locals.

### Template: `templates/agents.ts.erb`

```erb
// Code generated by scripts/codegen-agents — DO NOT EDIT.
// Source: <%= source_path %>

export type AgentType = <%= agents.keys.map { |id| id.inspect }.join(" | ") %>;

export const ALL_AGENTS: readonly AgentType[] = [
<% agents.keys.each do |id| -%>
  "<%= id %>",
<% end -%>
] as const;

export const AGENT_LABELS: Record<AgentType, string> = {
<% agents.each do |id, meta| -%>
  "<%= id %>": <%= meta["label"].inspect %>,
<% end -%>
};

export const AGENT_COLORS: Record<AgentType, string> = {
<% agents.each do |id, meta| -%>
  "<%= id %>": <%= meta["color"].inspect %>,
<% end -%>
};

type AgentCapabilities = {
  fields: Record<string, boolean>;
  metrics: Record<string, boolean>;
};

export const AGENT_CAPABILITIES: Record<AgentType, AgentCapabilities> = {
<% agents.each do |id, meta| -%>
  "<%= id %>": {
    fields: {
<% raw["field_keys"].each do |k| -%>
      <%= k %>: <%= meta["fields"][k] %>,
<% end -%>
    },
    metrics: {
<% raw["metric_slugs"].each do |s| -%>
      "<%= s %>": <%= meta["metrics"][s] %>,
<% end -%>
    },
  },
<% end -%>
};

export function isAgentType(value: string): value is AgentType {
  return (ALL_AGENTS as readonly string[]).includes(value);
}

export function agentSupportsMetric(id: AgentType, slug: string): boolean {
  return AGENT_CAPABILITIES[id].metrics[slug] ?? false;
}

export function agentsSupportingMetric(slug: string): AgentType[] {
  return ALL_AGENTS.filter((id) => agentSupportsMetric(id, slug));
}

export function metricHasMultipleAgents(slug: string): boolean {
  return agentsSupportingMetric(slug).length > 1;
}
```

### Template: `templates/agent_types.txt.erb`

```erb
<% agents.keys.each do |id| -%>
<%= id %>
<% end -%>
```

(One per line, trailing newline. Loaded by a Rails initializer for ActiveModel inclusion validation; see Phase 1.)

### Justfile recipes

Add to root `Justfile`:

```just
# Run codegen for the agent registry
codegen-agents:
    ruby scripts/codegen-agents/generate.rb

# Verify codegen output is up-to-date (CI gate)
codegen-agents-check:
    ruby scripts/codegen-agents/generate.rb --check

# Test the codegen script itself
codegen-agents-test:
    cd scripts/codegen-agents && bundle exec rspec
```

(The codegen script's spec uses `rspec` directly. Add a small `Gemfile` in `scripts/codegen-agents/` with `gem "rspec"` if not already available globally. If the user prefers using `server/`'s Gemfile, alias accordingly.)

### CI integration

Add to `.github/workflows/ci.yml` after the `changes` job, before per-language jobs:

```yaml
  codegen-check:
    needs: changes
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.3'
      - name: Verify codegen output is current
        run: ruby scripts/codegen-agents/generate.rb --check
```

This job runs on **every** PR (no path filter) — generated files affect all three languages, and a stale registry is always a bug. Failure produces:

```
Generated files are out of date:
  - cli/internal/agents/registry.gen.go
  - dashboard/src/lib/agents.gen.ts
Run: just codegen-agents
```

### CLAUDE.md `## Pre-push checks` update

Add `just codegen-agents-check` to the top of the Pre-push checks section. Example:

```markdown
**Codegen (always):**
```bash
just codegen-agents-check
```
```

### Header format on generated files

Every generated file MUST start with a "code generated" header that matches its language conventions:

- Go: `// Code generated by scripts/codegen-agents — DO NOT EDIT.` (`go vet` recognizes the regex `^// Code generated .* DO NOT EDIT\.$`)
- Ruby: `# Code generated by scripts/codegen-agents — DO NOT EDIT.`
- TS: `// Code generated by scripts/codegen-agents — DO NOT EDIT.`
- TXT: no header (it's data).

### Optional pre-commit hook

Document in `wiki/conventions.md` (do not auto-install). Devs who want it copy this to `.git/hooks/pre-commit`:

```bash
#!/usr/bin/env bash
if git diff --cached --name-only | grep -qE '^config/agents\.yaml$'; then
  ruby scripts/codegen-agents/generate.rb --check || {
    echo "agents.yaml changed but generated files are stale. Run: just codegen-agents" >&2
    exit 1
  }
fi
```

### Tests for the codegen itself

`scripts/codegen-agents/spec/generate_spec.rb` covers:

- Valid YAML produces deterministic output (golden-file compare against fixtures).
- Schema violations: missing field key, unknown field key, invalid color, empty `hook_scopes`, unknown agent_id pattern.
- `--check` mode exits 0 when in sync, 1 when stale.
- Templates handle empty `agents:` map (edge case — should be a schema error).
- Each generated file passes a syntax check after rendering: `go vet` for Go output, `ruby -c` for Ruby, `tsc --noEmit` for TS. (These can be invoked from the spec via `Open3.capture3`.)

---

## Provider interface (Go)

### Package layout

```
cli/internal/
  agents/
    registry.gen.go              # codegen output
    provider.go                  # Provider interface + supporting types
    providers.go                 # RegisteredProviders() — assembles all impls
    claude/
      provider.go                # ClaudeProvider implementing agents.Provider
      discovery.go               # FindSessionFiles logic (moved from parsers/)
      parser.go                  # ParseSession logic (moved from parsers/)
      tools.go                   # tool name → category map
      claude_test.go
      testdata/
        normal_session.jsonl     # moved from cli/internal/parsers/testdata/
        sidechain_session.jsonl
        ...
    copilot/
      provider.go
      discovery.go               # FindCopilotSessionsForRepo + DiscoverCopilotWorkspaces
      parser.go
      workspace.go               # ParseCopilotWorkspace
      tools.go
      copilot_test.go
      testdata/
        events.jsonl
        workspace.yaml
    cursor/                      # added in Phase 7
      provider.go
      discovery.go
      parser.go
      applypatch.go
      tools.go
      cursor_test.go
      testdata/
  parsers/                       # KEEP — but slimmed
    session.go                   # ParsedSession type ONLY (moved from claude_sessions.go)
    github.go                    # unchanged — not agent-specific
```

> **Why keep `parsers/`?** `ParsedSession` is the shared type all providers produce. Keeping it in `parsers/` (renamed `session.go`) avoids a giant import cycle when `agents.Provider` returns it.

### `cli/internal/agents/provider.go`

```go
// Package agents defines the contract every coding-agent integration
// implements: discovery (where sessions live on disk), parsing (turn raw
// session data into a ParsedSession), and a capability declaration.
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
    //   - Cursor: needs both, plus GitRemoteFn to derive owner/repo from local path
    DiscoverSessions(target DiscoveryTarget) ([]SessionLocator, error)

    // Parse turns one SessionLocator into a ParsedSession. The returned session
    // MUST have AgentType set to p.ID() (parser implementations should not have
    // to remember this — wrap or assert it in Provider.Parse).
    Parse(loc SessionLocator) (*parsers.ParsedSession, error)

    // Capabilities returns the static capability declaration for this agent.
    Capabilities() Capabilities
}

// DiscoveryTarget describes "find sessions for this repo" or "find sessions for
// this local path." Different providers need different signals; pass everything
// available, let each provider use what it needs.
type DiscoveryTarget struct {
    OwnerRepo   string // "owner/repo" — empty for global discovery, populated for ax push --repo
    LocalPath   string // filesystem path — populated for ax push --repo
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
```

### `cli/internal/agents/providers.go`

```go
package agents

import (
    "github.com/austinroos/ax/internal/agents/claude"
    "github.com/austinroos/ax/internal/agents/copilot"
    // cursor will be added in Phase 7
)

// RegisteredProviders returns every provider compiled into the binary.
// Order matters only for log/UI display; behavior is order-independent.
func RegisteredProviders() []Provider {
    return []Provider{
        claude.New(),
        copilot.New(),
        // cursor.New(),  // Phase 7
    }
}

// FindProvider returns the provider for an AgentID, or nil if unknown.
func FindProvider(id AgentID) Provider {
    for _, p := range RegisteredProviders() {
        if p.ID() == id {
            return p
        }
    }
    return nil
}
```

### Per-agent provider skeleton (Claude example)

`cli/internal/agents/claude/provider.go`:

```go
package claude

import (
    "os"
    "path/filepath"

    "github.com/austinroos/ax/internal/agents"
    "github.com/austinroos/ax/internal/parsers"
)

const id = agents.AgentID("claude_code")

type Provider struct{}

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
        return nil, nil // Claude needs a local path
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
```

The `findSessionFiles`, `parseSession`, `sessionIDFromPath` functions in `cli/internal/agents/claude/discovery.go` and `parser.go` are **direct moves** of the existing code from `cli/internal/parsers/claude_sessions.go`. Phase 3 instruction: do not change parser logic — move + repackage only.

### Caller migration

`cli/cmd/ax/main.go` push handler (currently lines 251-267) becomes:

```go
target := agents.DiscoveryTarget{
    LocalPath:   path,
    OwnerRepo:   owner + "/" + repo,
    GitRemoteFn: bulk.ParseGitRemoteFromPath,
}

var allLocs []agents.SessionLocator
for _, p := range agents.RegisteredProviders() {
    if !p.HomeExists() {
        continue
    }
    locs, err := p.DiscoverSessions(target)
    if err != nil {
        return fmt.Errorf("%s: discovery failed: %w", p.ID(), err)
    }
    allLocs = append(allLocs, locs...)
}

allLocs = dedupLocators(allLocs)

// Filter to only new sessions unless --force
// ... (existing state filter logic, but operating on []agents.SessionLocator instead of []string)

for _, loc := range allLocs {
    p := agents.FindProvider(loc.AgentID)
    sess, err := p.Parse(loc)
    if err != nil { continue }
    payload.Sessions = append(payload.Sessions, sess.ToSessionData())
}
```

`bulk/discovery.go` follows the same pattern. Detailed steps in [Phase 3](#phase-3--provider-interface-refactor-go).

---

## Capability matrix wiring

### CLI side

`cli/internal/parsers/session.go` (the renamed shared types file) — `ToSessionData()` consults `agents.Registry()` for nullable fields:

```go
func (s *ParsedSession) ToSessionData() api.SessionData {
    caps := agents.Registry()[agents.AgentID(s.AgentType)].Capabilities

    var sidechainMessages *int
    if caps.Fields["sidechain_messages"] {
        v := s.SidechainMessages
        sidechainMessages = &v
    }

    var peakContextPct *float64
    if caps.Fields["peak_context_pct"] && s.PeakContextTokens > 0 {
        maxCtx := pricing.LookupMaxContext(s.PrimaryModel)
        v := float64(s.PeakContextTokens) / float64(maxCtx)
        peakContextPct = &v
    }

    sd := api.SessionData{ /* ... existing fields ... */ }

    // Token columns: explicit nil for capability=false agents (Phase 2 schema makes nullable)
    if !caps.Fields["input_tokens"] {
        sd.InputTokens = nil
    }
    // ... same for output_tokens, cache_creation_input_tokens, cache_read_input_tokens

    return sd
}
```

Note: this requires the `api.SessionData` token fields to become `*int` pointers — see Phase 2 schema migration.

### Server side

`server/app/services/push_service.rb`:

```ruby
def field_value(session_data, field)
  agent_type = session_data[:agent_type] || "claude_code"
  return nil unless AgentRegistry.supports_field?(agent_type, field)
  session_data[field]
end

# Replaces sidechain_messages_for and any analogous helpers.
```

`upsert_sessions` row construction uses `field_value(s, :sidechain_messages)` etc. for capability-gated fields.

`server/app/services/metrics_aggregator.rb` — `SESSION_METRIC_EXPRESSIONS` becomes:

```ruby
SESSION_METRIC_EXPRESSIONS = {
  "iteration-depth"      => { sql: "turn_count", requires: %i[] },
  "token-cost-per-pr"    => { sql: "input_tokens + output_tokens", requires: %i[input_tokens output_tokens] },
  "cache-hit-rate"       => { sql: "cache_read_input_tokens::float / NULLIF(input_tokens + cache_creation_input_tokens + cache_read_input_tokens, 0)", requires: %i[input_tokens cache_read_input_tokens cache_creation_input_tokens] },
  "sidechain-rate"       => { sql: "CASE WHEN sidechain_messages IS NOT NULL THEN sidechain_messages::float / NULLIF(message_count + assistant_message_count, 0) END", requires: %i[sidechain_messages] },
  "re-read-rate"         => { sql: "total_file_reads::float / NULLIF(files_read_count, 0)", requires: %i[total_file_reads] },
  "autonomy-score"       => { sql: "assistant_message_count::float / NULLIF(message_count, 0)", requires: %i[] },
  "peak-context-pct"     => { sql: "peak_context_pct", requires: %i[peak_context_pct] },
  "subagent-delegation"  => { sql: "agent_tool_calls::float / NULLIF(total_tool_calls, 0)", requires: %i[agent_tool_calls] },
  "skill-tool-usage"     => { sql: "(skill_tool_calls + mcp_tool_calls)::float / NULLIF(total_tool_calls, 0)", requires: %i[skill_tool_calls mcp_tool_calls] }
}.freeze
```

The pre-computed `SESSION_AVG_PICKS`, `SESSION_SPARKLINE_SELECTS`, `SESSION_SPARKLINE_ALIASES` constants become methods that filter to "metrics this aggregator should compute" given `@agent_type`:

```ruby
def session_metrics_for_query
  return SESSION_METRIC_EXPRESSIONS if @agent_type.nil?
  SESSION_METRIC_EXPRESSIONS.select do |_, meta|
    meta[:requires].all? { |f| AgentRegistry.supports_field?(@agent_type, f) }
  end
end

def session_avg_picks
  session_metrics_for_query.values.map { |meta| Arel.sql("AVG(#{meta[:sql]})") }
end

# similar for sparkline_selects / sparkline_aliases
```

When a metric is filtered out for the current `@agent_type`, the aggregator returns it as `{ current: nil, prior: nil, sparkline: [] }` — the dashboard renders this as "N/A for this agent" (Phase 5).

`task_cycle_time_join_for(agent_type)` becomes a SQL builder:

```ruby
def self.task_cycle_time_join_for(agent_type)
  agent_filter = agent_type ? "WHERE sessions.agent_type = #{ActiveRecord::Base.connection.quote(agent_type)}" : ""
  <<~SQL.squish
    LEFT JOIN (
      SELECT session_prs.pr_id, MIN(sessions.started_at) AS min_started
      FROM session_prs
      JOIN sessions ON sessions.id = session_prs.session_id
      #{agent_filter}
      GROUP BY session_prs.pr_id
    ) first_sessions ON first_sessions.pr_id = prs.id
  SQL
end
```

> **Brakeman note**: `quote()` parameterizes the value. Add `# brakeman:disable SQLInjection — ActiveRecord.quote ensures parameterization` comment if Brakeman flags it. Fall back to a hash lookup driven by `AgentRegistry::VALID_IDS` if Brakeman insists.

### Server endpoint: `GET /api/v1/agents`

Returns the full registry to the dashboard:

```ruby
# server/app/controllers/api/v1/agents_controller.rb
module Api
  module V1
    class AgentsController < BaseController
      before_action :require_session_auth!

      def index
        render json: { agents: AgentRegistry::AGENTS }
      end
    end
  end
end
```

Route: `get "agents", to: "agents#index"` inside the `api/v1` namespace.

The dashboard caches this client-side; for now it's an extra fetch on dashboard load (cheap — the registry is tiny).

### Dashboard side

`dashboard/src/components/agent-type-filter.tsx`:

```tsx
"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ALL_AGENTS, AGENT_LABELS, type AgentType } from "@/lib/agents.gen";
import { /* DropdownMenu... */ } from "@/components/ui/dropdown-menu";

interface Props {
  current?: AgentType;
  agents?: readonly AgentType[];   // when set, restrict to these (e.g. metricsupporting)
}

export function AgentTypeFilter({ current, agents = ALL_AGENTS }: Props) {
  // ... existing hooks
  return (
    <DropdownMenu>
      <DropdownMenuTrigger /* ... */>
        {current ? AGENT_LABELS[current] : "All Agents"}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={current ?? "all"} onValueChange={handleChange}>
          <DropdownMenuRadioItem value="all">All Agents</DropdownMenuRadioItem>
          {agents.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>{AGENT_LABELS[id]}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Metric detail pages (`(app)/[slug]/me/metrics/[metric]/page.tsx` and three siblings) replace the `isSession && <AgentTypeFilter>` heuristic with:

```tsx
import { metricHasMultipleAgents, agentsSupportingMetric } from "@/lib/agents.gen";

const supporting = agentsSupportingMetric(metric);
{metricHasMultipleAgents(metric) && (
  <AgentTypeFilter current={agentType} agents={supporting} />
)}
{supporting.length === 1 && (
  <span className="text-muted-foreground text-sm">
    Only available for {AGENT_LABELS[supporting[0]]}
  </span>
)}
```

`parseAgentType` in `dashboard/src/lib/utils.ts` becomes:

```ts
import { isAgentType, type AgentType } from "@/lib/agents.gen";
export function parseAgentType(value?: string): AgentType | undefined {
  return value && isAgentType(value) ? value : undefined;
}
```

NULL rendering — see Phase 5 for `metric-card.tsx` tooltip pattern.

---

## Wire-format versioning

### CLI

`cli/internal/api/types.go`:

```go
type PushPayload struct {
    PayloadVersion int           `json:"payload_version"`             // NEW: always 1 in this PR
    RepoPath       string        `json:"repo_path,omitempty"`
    RemoteURL      string        `json:"remote_url,omitempty"`
    Owner          string        `json:"owner"`
    Repo           string        `json:"repo"`
    Sessions       []SessionData `json:"sessions"`
}
```

In `cli/internal/push/client.go` (or wherever payloads are constructed): set `PayloadVersion: 1` on every push.

### Server

`server/app/controllers/api/v1/push_controller.rb`:

```ruby
def create
  version = params[:payload_version] || 1
  case version.to_i
  when 1
    service = PushService.new(params, user: @current_user)
    counts = service.execute
    render json: { ok: true, entities: counts }
  else
    Rails.logger.warn("Push received unknown payload_version=#{version} from user_id=#{@current_user.id}")
    render json: { ok: false, error: "Unsupported payload_version: #{version}" }, status: :bad_request
  end
end
```

The `PushService` records `payload_version` on each session row (Phase 2 schema migration adds the column).

### Bumping rules

A `payload_version` bump is required when:

- A field's semantics change (e.g., per-message vs aggregate token reporting).
- A required field becomes optional or vice versa.
- A field's wire type changes (e.g., int → object).

Adding a new optional field stays at v1.

---

## Hook installer interface

### Package layout

```
cli/internal/hooks/
  installer.go              # Installer interface + Scope enum
  installers.go             # RegisteredInstallers()
  pushcommand/
    script.go               # parameterized bash one-liner generator
    script_test.go
  claude/
    installer.go            # Claude Code: user scope
    installer_test.go
  copilot/
    installer.go            # Copilot CLI: repo scope
    installer_test.go
  cursor/                   # added in Phase 7
    installer.go            # Cursor: user + repo
    installer_test.go
```

The current `hooks.go` and `copilot_hooks.go` are deleted; their logic moves to `hooks/claude/installer.go` and `hooks/copilot/installer.go`.

### `cli/internal/hooks/installer.go`

```go
package hooks

import "github.com/austinroos/ax/internal/agents"

type Scope int

const (
    UserScope Scope = 1 << iota
    RepoScope
)

func (s Scope) Has(other Scope) bool { return s&other != 0 }

type Installer interface {
    AgentID() agents.AgentID
    Scopes() Scope
    HomeExists() bool

    Install(ctx InstallContext) (Installed, error)
    Uninstall(ctx InstallContext) error
    IsInstalled(ctx InstallContext) bool
}

type InstallContext struct {
    AxBinary string
    HomeDir  string // for user scope
    RepoPath string // for repo scope
    Scope    Scope  // which scope this call targets
}

type Installed struct {
    Path    string // file path written
    Created bool   // true if AX created it; false if it was already present + matched
    Message string // human-friendly note for ax init UI
}
```

### `cli/internal/hooks/pushcommand/script.go`

Extracts the inline bash from the current `hooks.go:38-43`:

```go
package pushcommand

import "fmt"

type Spec struct {
    AxBinary       string
    LogPath        string // default: $HOME/.ax/push.log
    WorktreeMarker string // e.g. "/.claude/worktrees/" — empty for agents without worktrees
}

// Build returns the bash one-liner that runs `ax push --repo` for the cwd
// found in hook input, with worktree-resolution and timestamped logging.
func Build(s Spec) string {
    log := s.LogPath
    if log == "" {
        log = `$HOME/.ax/push.log`
    }
    worktreeFallback := ""
    if s.WorktreeMarker != "" {
        worktreeFallback = fmt.Sprintf(`if [ -z "$PUSH_REPO" ]; then REPO=$(echo "$CWD" | sed -n "s|%s.*||p"); if [ -n "$REPO" ] && [ -d "$REPO/.git" ]; then PUSH_REPO="$REPO"; fi; fi; `, s.WorktreeMarker)
    }
    return fmt.Sprintf(
        `bash -c 'LOG="%s"; mkdir -p "$(dirname "$LOG")"; TS() { date +%%Y-%%m-%%dT%%H:%%M:%%S; }; INPUT=$(cat); CWD=$(echo "$INPUT" | grep -o "\"cwd\": *\"[^\"]*\"" | cut -d\" -f4); if [ -z "$CWD" ]; then echo "[$(TS)] skip: no cwd in hook input" >> "$LOG"; exit 0; fi; PUSH_REPO=""; if [ -e "$CWD/.git" ]; then PUSH_REPO="$CWD"; fi; %sif [ -z "$PUSH_REPO" ]; then echo "[$(TS)] skip: no git repo at $CWD" >> "$LOG"; exit 0; fi; OUTPUT=$(%s push --repo "$PUSH_REPO" 2>&1); RC=$?; if [ -n "$OUTPUT" ]; then echo "$OUTPUT" | while IFS= read -r line; do [ -n "$line" ] && echo "[$(TS)] $line" >> "$LOG"; done; fi; if [ $RC -eq 0 ]; then echo "[$(TS)] ok: push completed for $PUSH_REPO" >> "$LOG"; else echo "[$(TS)] error: push failed for $PUSH_REPO (exit $RC)" >> "$LOG"; fi'`,
        log, worktreeFallback, s.AxBinary,
    )
}
```

`script_test.go` covers:

- Worktree marker present → fallback present in output.
- Worktree marker absent → no fallback section.
- Custom log path → reflected in output.
- Output passes a basic "shell parses without error" check (`bash -n -c '<output>'`).

### `cli/internal/hooks/installers.go`

```go
package hooks

import (
    "github.com/austinroos/ax/internal/hooks/claude"
    "github.com/austinroos/ax/internal/hooks/copilot"
    // cursor will be added in Phase 7
)

func RegisteredInstallers() []Installer {
    return []Installer{
        claude.NewInstaller(),
        copilot.NewInstaller(),
    }
}
```

### Caller migration

`cli/cmd/ax/main.go:160-182` (initManagedMode) becomes:

```go
ctx := hooks.InstallContext{
    AxBinary: axBinary,
    HomeDir:  home,
    RepoPath: repoPath, // from os.Getwd() if available
}

for _, inst := range hooks.RegisteredInstallers() {
    if !inst.HomeExists() { continue }
    for _, scope := range []hooks.Scope{hooks.UserScope, hooks.RepoScope} {
        if !inst.Scopes().Has(scope) { continue }
        if scope == hooks.RepoScope && !isGitRepo(repoPath) { continue }

        scopedCtx := ctx
        scopedCtx.Scope = scope
        result, err := inst.Install(scopedCtx)
        if err != nil { return fmt.Errorf("%s: install failed: %w", inst.AgentID(), err) }

        meta := agents.Registry()[inst.AgentID()]
        fmt.Printf("           %s %s %s hook installed\n", ui.SuccessIcon(), meta.Label, scopeLabel(scope))
        if result.Message != "" {
            fmt.Printf("           %s\n", result.Message)
        }
    }
}
```

`--uninstall` path mirrors the iteration.

---

## Schema changes (full migration code)

### Migration 1 — Phase 2

`server/db/migrate/20260427000001_add_payload_version_and_extras_to_sessions.rb`:

```ruby
class AddPayloadVersionAndExtrasToSessions < ActiveRecord::Migration[8.0]
  def change
    change_table :sessions do |t|
      t.integer :payload_version, default: 1, null: false
      t.jsonb :extras, default: {}, null: false
    end

    # Drop the agent_type default — push always sets it as of PR #232.
    change_column_default :sessions, :agent_type, from: "claude_code", to: nil
  end
end
```

### Migration 2 — Phase 2

`server/db/migrate/20260427000002_make_token_columns_nullable.rb`:

```ruby
class MakeTokenColumnsNullable < ActiveRecord::Migration[8.0]
  def change
    change_column_null :sessions, :input_tokens, true
    change_column_null :sessions, :output_tokens, true
    change_column_null :sessions, :cache_creation_input_tokens, true
    change_column_null :sessions, :cache_read_input_tokens, true
    # No data backfill needed — existing rows have integer values which
    # remain valid; only future Cursor rows will arrive as NULL.
  end
end
```

> **Reversibility note**: `change_column_null` reverses cleanly. If a rollback ever needed to set non-null again, a defensive `UPDATE sessions SET input_tokens = 0 WHERE input_tokens IS NULL` would be required first. Document in the migration if your team requires explicit `def up`/`def down`.

### Rails validation (replaces SQL CHECK)

`server/config/initializers/agent_registry_validation.rb`:

```ruby
# Loaded after AgentRegistry. Configures CodingSession with the registry-driven
# inclusion validator. We use a Rails validation rather than a CHECK constraint
# so the valid set is derived from agents.yaml (one source of truth).
Rails.application.config.to_prepare do
  CodingSession.validates :agent_type, inclusion: { in: AgentRegistry::VALID_IDS }
end
```

`server/app/models/coding_session.rb` — confirm the validation is loaded; add a model-level test that asserts an unknown `agent_type` is rejected.

---

## The seven surfaces — change matrix

| Surface | Files removed/replaced | Files added |
|---|---|---|
| 1. Agent identity (11 places) | All literal `"claude_code"` / `"copilot_cli"` strings | `config/agents.yaml`, four codegen outputs |
| 2. Session discovery | `parsers.FindSessionFiles`, `parsers.FindCopilotSessionsForRepo`; sequential calls in `main.go:258-267` and `bulk/discovery.go:78-96, 124-139` | `agents.Provider.DiscoverSessions`; iteration loop in `main.go` and `bulk/discovery.go` |
| 3. Session parsing | `parsers.ParseSession` dispatcher (`claude_sessions.go:317-345`) | `agents.Provider.Parse` per agent |
| 4. Tool taxonomy | Hardcoded switches in each parser | Per-provider `ToolMap` struct in `agents/<id>/tools.go` |
| 5. Metric availability | `claude_sessions.go:81-85`, `push_service.rb:159-164` ad-hoc nil dance | `AgentRegistry.supports_field?` and aggregator filtering |
| 6. Hook installation | `hooks/hooks.go`, `hooks/copilot_hooks.go` (separate installers) | `hooks.Installer` interface, per-agent installers, `pushcommand` shared helper |
| 7. Repo identity | `FindSessionFiles(claudeDir, projectPath)` vs `FindCopilotSessionsForRepo(copilotDir, ownerRepo)` | `DiscoveryTarget` carrying both `LocalPath` and `OwnerRepo` plus a `GitRemoteFn` resolver |

---

## Phased roadmap

Each phase has: **Goal**, **Files to create / edit / delete**, **Code sketches**, **Tests**, **Exit criteria**, **Common gotchas**, **Sonnet sub-agent prompt template**.

Phases 1, 4, 5, 9 are largely Ruby/TS/docs (user can drive directly).
Phases 3, 6, 7, 8 are Go-heavy (delegate to Sonnet sub-agents).
Phase 2 spans CLI + server + migrations.

Phases are ordered for shippability — each phase is a working PR by itself, and Claude/Copilot users see no behavior change through Phase 6.

---

### Phase 1 — Agent registry + codegen pipeline

**Goal:** stand up the codegen and replace all 11 hand-edited spots from the inventory.

**Files to create:**

- `config/agents.yaml` — the source of truth (without Cursor entry; that lands Phase 7).
- `scripts/codegen-agents/generate.rb`
- `scripts/codegen-agents/schema.rb`
- `scripts/codegen-agents/templates/registry.go.erb`
- `scripts/codegen-agents/templates/agent_registry.rb.erb`
- `scripts/codegen-agents/templates/agents.ts.erb`
- `scripts/codegen-agents/templates/agent_types.txt.erb`
- `scripts/codegen-agents/spec/generate_spec.rb`
- `scripts/codegen-agents/Gemfile` (with `gem "rspec"`)
- `cli/internal/agents/registry.gen.go` (codegen output — committed, not gitignored)
- `server/app/models/agent_registry.rb` (codegen output — committed)
- `server/config/initializers/agent_registry_validation.rb`
- `dashboard/src/lib/agents.gen.ts` (codegen output — committed)
- `server/db/agent_types.txt` (codegen output — committed)

**Files to edit:**

- Root `Justfile` — add `codegen-agents`, `codegen-agents-check`, `codegen-agents-test` recipes.
- `.github/workflows/ci.yml` — add `codegen-check` job (runs unconditionally).
- `CLAUDE.md` — add `## Pre-push checks` codegen line at top.
- `dashboard/src/lib/db.ts:182` — replace `export type AgentType = "claude_code" | "copilot_cli"` with `export { type AgentType } from "@/lib/agents.gen"`.
- `dashboard/src/lib/utils.ts:16-18` — `parseAgentType` reads from `agents.gen.ts`.
- `dashboard/src/components/agent-type-filter.tsx:14-18, 47-51` — read `LABELS` from `AGENT_LABELS`, render radio items via `ALL_AGENTS.map`.
- `dashboard/src/lib/mock/data.ts:532` — replace hardcoded `idx % 3` with `ALL_AGENTS[idx % ALL_AGENTS.length]`.
- `server/app/controllers/api/v1/base_controller.rb:88` — replace `VALID_AGENT_TYPES = ["claude_code", "copilot_cli"]` with `VALID_AGENT_TYPES = AgentRegistry::VALID_IDS`.
- `cli/internal/parsers/claude_sessions.go:69-85, 352` — use `agents.ClaudeCode` const (the `AgentID` from `registry.gen.go`); the conditional logic stays for now (Phase 4 cleans it up via capability lookup).
- `cli/internal/parsers/copilot_sessions.go:99` — use `agents.CopilotCli` const.

> **Naming clash warning**: the existing `parsers` package and the new `agents` package both want to live under `cli/internal/`. Phase 1 creates `cli/internal/agents/registry.gen.go` and a thin `cli/internal/agents/types.go` (just the `AgentID` type alias and convenience consts). The full `agents/` package layout from "Provider interface" lands in Phase 3.

**Files to delete:** none.

**Tests:**

- `scripts/codegen-agents/spec/generate_spec.rb` covers schema validation, golden-file rendering, and `--check` mode.
- Existing Go tests pass unchanged (the consts are equivalent to the literals).
- Existing Rails specs pass unchanged.
- Existing dashboard tests pass unchanged. Add a new test in `dashboard/__tests__/agents.test.ts` (or wherever the existing test convention is — check the dashboard's `package.json` scripts) that asserts `ALL_AGENTS` matches `Object.keys(AGENT_LABELS)`.

**Exit criteria:**

- `just codegen-agents-check` is green on `main`.
- All 11 hardcoded literal spots from research-doc Surface 1 inventory now reference the registry.
- `just dashboard-typecheck` passes (the literal-union replacement is the highest typecheck risk).
- CI passes; `codegen-check` job is on every PR.

**Common gotchas:**

- ERB templating is whitespace-sensitive. Use `<%-` and `-%>` to trim newlines around control tags. The generator spec should use a golden-file fixture so whitespace regressions show up as test failures.
- Rails autoload: `AgentRegistry` lives in `server/app/models/agent_registry.rb` so Rails autoloads it. If autoload trips on the `_test` suffix or any non-`.rb` file in `models/`, file the file under `app/lib/` instead (more conventional for non-AR modules) — but this requires updating `config.autoload_lib` if not already in use. Recommend `app/models/` first; switch to `app/lib/` only if Rails complains.
- Dashboard mock data: the file at `dashboard/src/lib/mock/data.ts:532` may now generate sessions for cursor_cli even though Cursor is not in `agents.yaml` Phase 1. After Phase 1, `ALL_AGENTS` only contains `claude_code` + `copilot_cli`, so this is fine.
- `dashboard/src/lib/db.ts` re-exporting types: TS supports `export { type AgentType } from "..."` syntax; verify the project's `tsconfig.json` has `isolatedModules: true` which requires the `type` keyword.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 1 of plans/multi-agent-abstractions.md (Agent registry + codegen pipeline)
in the worktree at /Users/austinroos/dev/ax/.claude/worktrees/multi-agent-abstractions-plan.

Read the plan's "Phase 1" and "Codegen pipeline" sections in full before starting. The
plan specifies:
  - The exact YAML schema for config/agents.yaml (claude_code + copilot_cli only, no
    cursor_cli yet).
  - The four ERB templates and what each output file should contain.
  - The Justfile recipes and CI job to add.
  - The 11 hardcoded literal spots to replace, by file path and line number.

Constraints:
  - Use absolute paths. Do NOT cd.
  - Do NOT add Cursor; that lands in Phase 7.
  - Do NOT change parser logic; just replace string literals with generated consts.
  - Generated *.gen.* files MUST start with the "Code generated — DO NOT EDIT" header.
  - Do NOT add comments to existing code beyond what's strictly necessary.
  - Run `just codegen-agents` after writing the generator. Commit the generated files.

When done, run:
  - just codegen-agents-check
  - just cli-vet && just cli-test && just cli-build
  - just server-test
  - just dashboard-typecheck && just dashboard-test

Report any test failures. Do not change unrelated files. Do not commit; the parent agent
will review and use the pull-request-creator agent.
```

---

### Phase 2 — Wire-format versioning + capability declarations

**Goal:** introduce `payload_version`, make token columns nullable, add `extras` JSONB, and replace the ad-hoc `nil`-vs-zero logic in `push_service.rb` with `AgentRegistry` lookups.

**Files to create:**

- `server/db/migrate/20260427000001_add_payload_version_and_extras_to_sessions.rb`
- `server/db/migrate/20260427000002_make_token_columns_nullable.rb`
- `server/spec/services/push_service_extras_spec.rb` (new spec file or extend existing)

**Files to edit:**

- `cli/internal/api/types.go`:
  - Add `PayloadVersion int` to `PushPayload`.
  - Change `InputTokens int` → `InputTokens *int`. Same for `OutputTokens`, `CacheCreationInputTokens`, `CacheReadInputTokens`.
- `cli/internal/parsers/claude_sessions.go:67-111` (`ToSessionData`):
  - Set token fields via pointers; capability lookup happens in Phase 4 (here, just preserve current behavior — always set pointer to value for Claude/Copilot).
- `cli/internal/parsers/copilot_sessions.go` — same treatment.
- `cli/internal/push/client.go` (or wherever `PushPayload` is constructed) — set `PayloadVersion: 1`.
- `server/app/controllers/api/v1/push_controller.rb` — read `payload_version`, route to v1 parser, log unknown.
- `server/app/services/push_service.rb`:
  - Replace `sidechain_messages_for(session_data)` with `field_value(session_data, :sidechain_messages)`.
  - Add `field_value` private helper that uses `AgentRegistry.supports_field?`.
  - In `upsert_sessions` row construction, use `field_value(s, :input_tokens)` etc. for token columns (nil-passthrough for non-supplying agents).
  - Add `extras: s[:extras] || {}` to the row.
  - Add `payload_version: @params[:payload_version]&.to_i || 1` to the row.

**Files to delete:** none.

**Tests:**

- `push_service_spec.rb`:
  - Adds tests asserting `agent_type=cursor_cli` (using a fake agent registry entry — see test setup note below) results in `input_tokens: nil` in the inserted row.
  - Asserts `extras` is persisted as JSONB.
  - Asserts `payload_version` is recorded.
- `push_controller_spec.rb`:
  - `payload_version=2` returns 400 with clear error.
  - Missing `payload_version` defaults to 1.

> **Test setup note**: The `cursor_cli` agent doesn't exist in `agents.yaml` until Phase 7. For Phase 2 tests, either (a) stub `AgentRegistry.supports_field?` in the spec via `allow(AgentRegistry).to receive(:supports_field?).and_call_original; allow(...).with("cursor_cli", :input_tokens).and_return(false)`, or (b) add an `extra_agents` test-only YAML fixture that the Phase 2 spec loads. Recommend (a) — minimal moving parts.

**Exit criteria:**

- New columns exist in `db/schema.rb`.
- Existing Claude/Copilot push payloads continue to work; round-trip identical.
- `payload_version` recorded on every new session.
- `field_value` helper passes lookups through `AgentRegistry`.
- All existing tests pass.

**Common gotchas:**

- Token field type change from `int` to `*int`: any caller that reads `sd.InputTokens` as a value-int will fail compile. `grep -rn "\.InputTokens" cli/` to find callers; update each to dereference (or return early on nil). The only known caller is `metrics_aggregator.go` if such a thing exists in CLI — verify.
- Migration ordering: `add_payload_version` first (adds column with default), then `make_token_columns_nullable`. Both can be in a single migration if preferred — keep them separate for review clarity.
- `change_column_default :sessions, :agent_type, from: "claude_code", to: nil` — the `from:` side is required for cleanly reversible migrations.
- Rails 8 specifics: confirm `change_column_null` is non-locking on Postgres (it is, since Rails 5.2). For very large `sessions` tables in production, consider running outside a transaction with `disable_ddl_transaction!`.
- `payload_version` on existing rows: the migration default `1` backfills correctly. Verify by spot-checking a few rows after migration.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 2 of plans/multi-agent-abstractions.md (Wire-format versioning +
capability declarations) in the worktree at <path>.

Read "Phase 2" and "Wire-format versioning" sections of the plan in full.

Constraints:
  - Phase 1 must already be merged (config/agents.yaml + AgentRegistry exist).
  - Token field type change from int to *int will break callers that read these
    fields as value-ints. Find them with grep and update each.
  - Migrations must be safe on a non-empty production sessions table (no full
    table rewrites, no data loss).
  - Tests for Cursor-style behavior should stub AgentRegistry per the plan; do
    NOT add a cursor_cli entry to agents.yaml (that's Phase 7).

Run after each layer:
  - just cli-vet && just cli-test && just cli-build
  - just server-test
  - bin/rails db:migrate (in server/) and verify schema.rb shape matches the plan

Report blockers. Do not commit.
```

---

### Phase 3 — Provider interface refactor (Go)

**Goal:** introduce `agents.Provider`, move `claude_sessions.go` and `copilot_sessions.go` into per-agent packages behind the interface, and refactor the two call sites (single-repo push and bulk discovery) to iterate registered providers. Behavior-preserving.

**Files to create:**

- `cli/internal/agents/provider.go` — `Provider` interface, `DiscoveryTarget`, `SessionLocator`, `GitRemoteFn`.
- `cli/internal/agents/providers.go` — `RegisteredProviders()`, `FindProvider(id)`.
- `cli/internal/agents/claude/provider.go`
- `cli/internal/agents/claude/discovery.go` — moved from `parsers/claude_sessions.go:215-294` (FindSessionFiles, collectSessionPaths, isSessionUUID).
- `cli/internal/agents/claude/parser.go` — moved from `parsers/claude_sessions.go:317-668` (ParseSession + helpers).
- `cli/internal/agents/claude/tools.go` — extracts the tool-name → category switch from `parser.go` into a declarative `ToolMap`.
- `cli/internal/agents/claude/claude_test.go` — existing parser tests, repointed to the new package.
- `cli/internal/agents/claude/testdata/` — moves `cli/internal/parsers/testdata/{normal,sidechain,multi_model,etc}_session.jsonl` here.
- `cli/internal/agents/copilot/provider.go`
- `cli/internal/agents/copilot/discovery.go` — moved from `parsers/copilot_discovery.go`.
- `cli/internal/agents/copilot/parser.go` — moved from `parsers/copilot_sessions.go`.
- `cli/internal/agents/copilot/workspace.go` — `ParseCopilotWorkspace` (moved).
- `cli/internal/agents/copilot/tools.go` — Copilot ToolMap.
- `cli/internal/agents/copilot/copilot_test.go` — existing tests, repointed.

**Files to edit:**

- `cli/internal/parsers/session.go` (NEW name; consider renaming `claude_sessions.go` → `session.go` after moving the parser code out) — keeps only `ParsedSession` + `ToSessionData()` + `LoadHistory` (used only by Claude — but lives in shared `parsers` because `bulk/discovery.go` needs it across provider boundaries). Verify if `LoadHistory` is still cross-cutting; if not, move it to `agents/claude/`.
- `cli/cmd/ax/main.go`:
  - Lines 251-267 (single-repo push): replace with provider-iteration loop.
  - Lines 296-305 (parse loop): replace with `agents.FindProvider(loc.AgentID).Parse(loc)`.
  - Lines 340-354 (`mergeSessionPaths`): replace with `dedupLocators([]agents.SessionLocator) []agents.SessionLocator` keyed on `SessionID`.
- `cli/internal/bulk/discovery.go`:
  - Replace lines 78-96 (Copilot inline discovery) and lines 124-139 (Copilot session-set merge) with a provider-iteration pattern.
  - The `DiscoveredRepo.SessionFiles` field becomes `SessionLocators []agents.SessionLocator` (string → typed locator).
- `cli/internal/bulk/push.go` (only if it consumes `SessionFiles`): update to consume `SessionLocators`.
- `cli/internal/state/state.go`: any caller that takes session-file path strings now takes `SessionLocator`s; the locator's `SessionID` is the dedup key (replaces `SessionIDFromPath`).

**Files to delete:**

- `cli/internal/parsers/claude_sessions.go` (after extracting `ParsedSession` to `parsers/session.go`).
- `cli/internal/parsers/copilot_sessions.go`
- `cli/internal/parsers/copilot_discovery.go`
- `cli/internal/parsers/testdata/*` (after moving to per-agent testdata).

**Code sketch — provider implementations:**

See "Provider interface (Go)" section above for the full Claude provider sketch. Copilot follows the same pattern; key differences:

- `DiscoverSessions` requires `target.OwnerRepo` (not `LocalPath`):
  ```go
  func (p *Provider) DiscoverSessions(target agents.DiscoveryTarget) ([]agents.SessionLocator, error) {
      if target.OwnerRepo == "" {
          return nil, nil
      }
      paths, err := findCopilotSessionsForRepo(p.HomeDir(), target.OwnerRepo)
      // ... wrap into SessionLocators
  }
  ```
- For bulk discovery (`ax push --all`), the single `DiscoveryTarget` may have neither `LocalPath` nor `OwnerRepo`. Add a `DiscoverAll(GitRemoteFn) ([]SessionLocator, error)` method to the interface OR pass empty target and let providers expose all sessions. Recommend the latter for simplicity:
  ```go
  // For bulk, the caller iterates discovered repos itself. Discovery is
  // per-repo; bulk discovery becomes:
  //   for each (owner, repo, localPath) in discoverRepos():
  //     for each provider: provider.DiscoverSessions(target)
  ```

**Code sketch — caller (bulk/discovery.go):**

```go
func DiscoverRepos(claudeDir string, gitRemoteFn GitRemoteFn) (*DiscoverySummary, error) {
    history, _ := parsers.LoadHistory(claudeDir)
    projectPaths := uniqueProjectPaths(history)

    type repoKey struct{ owner, repo string }
    repoTargets := make(map[repoKey]*DiscoveredRepo)

    // Resolve each Claude history path to a repo
    for _, path := range projectPaths {
        resolved := ResolveWorktreePath(path)
        if _, err := os.Stat(resolved); os.IsNotExist(err) { continue }
        owner, repo, err := gitRemoteFn(resolved)
        if err != nil { /* skip */ continue }
        key := repoKey{owner, repo}
        if _, ok := repoTargets[key]; !ok {
            repoTargets[key] = &DiscoveredRepo{
                Owner: owner, Repo: repo, OwnerRepo: owner + "/" + repo,
                ProjectPaths: []string{path},
            }
        } else {
            repoTargets[key].ProjectPaths = append(repoTargets[key].ProjectPaths, path)
        }
    }

    // For each repo, ask every provider for its sessions
    for key, dr := range repoTargets {
        target := agents.DiscoveryTarget{
            OwnerRepo:   dr.OwnerRepo,
            LocalPath:   dr.ProjectPaths[0], // representative; providers that need more iterate themselves
            GitRemoteFn: agents.GitRemoteFn(gitRemoteFn),
        }
        for _, p := range agents.RegisteredProviders() {
            if !p.HomeExists() { continue }
            // For providers that need to scan multiple LocalPaths (e.g. worktrees
            // for a Claude repo), call DiscoverSessions per path:
            for _, localPath := range dr.ProjectPaths {
                t := target
                t.LocalPath = localPath
                locs, _ := p.DiscoverSessions(t)
                dr.SessionLocators = append(dr.SessionLocators, locs...)
            }
        }
        dr.SessionLocators = dedupLocators(dr.SessionLocators)
    }

    // Also pick up Copilot-only repos (no Claude history) by asking the Copilot
    // provider for everything it can see, then folding into repoTargets.
    // ... (implementation parallels existing copilot_workspaces walk)
}
```

> **Bulk-discovery generalization gotcha**: today, `bulk/discovery.go` walks Claude history first and then "discovers Copilot repos that lack Claude history." A clean abstraction is harder than the existing code. Recommended Phase 3 approach: keep the two-pass shape (Claude-history-derived + Copilot-self-derived) but replace the inline Copilot logic with `copilotProvider.DiscoverAllRepos()` — add a separate, optional `DiscoverAllRepos() ([]RepoLocator, error)` to the Provider interface (or a side helper interface like `RepoEnumerator`). Spell this out in the implementation; do not let Sonnet improvise.

```go
// Optional interface; only providers that can self-enumerate repos implement it.
type RepoEnumerator interface {
    DiscoverAllRepos() ([]RepoLocator, error)
}

type RepoLocator struct {
    Owner, Repo, OwnerRepo string
    LocalPath              string
}

// In bulk/discovery.go:
for _, p := range agents.RegisteredProviders() {
    enum, ok := p.(agents.RepoEnumerator)
    if !ok { continue }
    repos, _ := enum.DiscoverAllRepos()
    for _, r := range repos {
        // fold into repoTargets...
    }
}
```

The Copilot provider implements `RepoEnumerator` (its workspace.yaml files self-describe `owner/repo`). The Claude provider does not (it requires `git remote` resolution per path; the history-walk is the existing code's job and stays in `bulk/discovery.go`). Cursor will implement it in Phase 7 (it has path-encoded project dirs, derives owner/repo via `GitRemoteFn`).

**Tests:**

- All existing parser tests (`claude_sessions_test.go`, `copilot_sessions_test.go`) continue to pass after relocating to per-agent packages.
- New `cli/internal/agents/agents_test.go`:
  - `TestRegisteredProvidersIncludesClaudeAndCopilot` — assert IDs are present.
  - `TestFindProviderUnknownReturnsNil`.
- New `cli/internal/agents/claude/claude_test.go` adds:
  - `TestProviderDiscoverSessionsWithoutLocalPathReturnsNil`.
  - `TestProviderParseSetsAgentType`.
- Same for Copilot.
- Integration test in `cli/cmd/ax/main_test.go` (or per-test-helper convention): set up a temp `~/.claude` and `~/.copilot`, run a fake push, assert `payload.Sessions` contains both agents' data.

**Exit criteria:**

- `cli/internal/parsers` contains only `session.go` (with `ParsedSession`/`ToSessionData`) and `github.go` (unchanged); maybe `LoadHistory` if it stays cross-cutting.
- `cli/internal/agents/<id>/` packages own all per-agent code.
- `main.go` and `bulk/discovery.go` contain no agent-name string literals.
- `just cli-vet && just cli-test && just cli-build` all pass.
- Push payload byte-identical to pre-Phase-3 for both Claude and Copilot scenarios (verified via integration test that diffs payloads against committed golden fixtures).

**Common gotchas:**

- Import cycles: `agents.Provider` returns `*parsers.ParsedSession`, so `agents` imports `parsers`. The provider implementations (`agents/claude`) import both `agents` (for the interface and `AgentID` consts) and `parsers` (for the type). Make sure `parsers` does NOT import `agents` (would cycle). The `ToSessionData()` capability lookup is the only place that wants this — Phase 4 resolves by either (a) passing capabilities into `ToSessionData(caps)` from the caller, or (b) moving `ToSessionData()` into `agents/` itself with a method on a wrapper. Recommend (a) — minimal API change.
- Test fixtures: when moving `testdata/` files, preserve byte-identical contents. Some Copilot tests compare against parsed timestamps that depend on the fixture text — diff carefully.
- `cli/internal/parsers/copilot_discovery.go` currently exposes `DefaultCopilotDir()` and `CopilotDirForClaudeDir()` — `bulk/discovery.go:78` calls the latter. These move into `agents/copilot/`; update `bulk/discovery.go` import. After Phase 3, `bulk/discovery.go` should no longer call these directly — instead, ask the Copilot provider for its `HomeDir()`.
- `cli/internal/state/state.go`'s `SessionIDFromPath` is used by `mergeSessionPaths`. After Phase 3, IDs come from `SessionLocator.SessionID` directly; `SessionIDFromPath` may become unused — delete if so.
- Worktree handling in Claude: `FindSessionFiles` globs both the project dir AND any `*--claude-worktrees-*` dirs. This is Claude-specific worktree convention; preserve verbatim.
- Behavior preservation is hard to verify without integration tests. Strongly recommend writing the golden-fixture push-payload integration test BEFORE moving any code. Sonnet sub-agents tend to "improve" code while moving it — flag that as a constraint.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 3 of plans/multi-agent-abstractions.md (Provider interface refactor) in
the worktree at <path>. THIS IS A BEHAVIOR-PRESERVING REFACTOR. Do not change parsing
logic; do not "improve" code; do not add features. Move + repackage only.

Phases 1 and 2 must be merged first. Read "Provider interface (Go)" and "Phase 3" of the
plan in full.

Steps:
  1. BEFORE moving any code, write a golden-fixture integration test in
     cli/cmd/ax/main_integration_test.go that runs a fake push for both
     Claude and Copilot fixtures and snapshots the resulting PushPayload as
     JSON files in testdata/. Make this test pass against current main.
  2. Add cli/internal/agents/{provider.go, providers.go, claude/, copilot/}.
  3. Move cli/internal/parsers/{claude_sessions.go, copilot_sessions.go,
     copilot_discovery.go} into per-agent packages, byte-for-byte where possible.
  4. Update cli/cmd/ax/main.go and cli/internal/bulk/discovery.go to iterate
     RegisteredProviders.
  5. Add the RepoEnumerator interface for Copilot's self-discovery (the plan
     specifies exact shape).
  6. Run the golden-fixture test from step 1. It MUST still pass — that's the
     proof of behavior preservation.
  7. Run: just cli-vet && just cli-test && just cli-build.

Constraints:
  - Use absolute paths.
  - Do not introduce import cycles. The Capabilities lookup in ToSessionData
    receives caps as an argument, not via package import.
  - Preserve test-fixture byte content when moving testdata files.
  - Do not add comments to existing code.

If any test fails, STOP and report. Do not "fix" by changing logic.
```

---

### Phase 4 — Server: capability-aware push validation + aggregator

**Goal:** wire `AgentRegistry` into `PushService` and `MetricsAggregator`. Replace the `TASK_CYCLE_TIME_JOINS` hash with a SQL builder. Add the `/api/v1/agents` endpoint.

**Files to create:**

- `server/app/controllers/api/v1/agents_controller.rb`
- `server/spec/controllers/api/v1/agents_controller_spec.rb`

**Files to edit:**

- `server/app/services/push_service.rb`:
  - `field_value(session_data, field)` helper (already added Phase 2 if you followed the plan order — extend to all nullable fields including `peak_context_pct`).
  - The hardcoded `sidechain_messages_for` is removed (replaced by `field_value`).
- `server/app/services/metrics_aggregator.rb`:
  - Convert `SESSION_METRIC_EXPRESSIONS` from `slug => sql_string` to `slug => { sql:, requires: [...] }`.
  - Convert `SESSION_AVG_PICKS`, `SESSION_SPARKLINE_SELECTS`, `SESSION_SPARKLINE_ALIASES` from constants to `private` methods that filter by `@agent_type`.
  - Replace `TASK_CYCLE_TIME_JOINS` constant with `task_cycle_time_join_for(agent_type)` that builds SQL with `connection.quote`.
  - In `call`, only emit metric entries for slugs the current `@agent_type` supports; for unsupported, return `{ current: nil, prior: nil, sparkline: [] }` to keep the response shape stable.
- `server/config/routes.rb`: add `get "agents", to: "agents#index"` inside the `api/v1` namespace.
- `server/app/controllers/api/v1/base_controller.rb`: `parsed_agent_type` reads from `AgentRegistry::VALID_IDS` instead of hardcoded array (already done in Phase 1; verify).

**Files to delete:** none.

**Tests:**

- `server/spec/services/metrics_aggregator_spec.rb`:
  - Add specs: filtered to `agent_type=copilot_cli`, `sidechain-rate` and `peak-context-pct` come back nil (with empty sparkline).
  - Add specs: filtered to `agent_type=copilot_cli`, `iteration-depth` and `cache-hit-rate` still compute.
  - Snapshot test for the SQL produced by `task_cycle_time_join_for(nil)` — must equal the current literal value (proving the builder didn't drift).
- `server/spec/controllers/api/v1/agents_controller_spec.rb`:
  - GET returns 200 with `agents:` payload matching `AgentRegistry::AGENTS`.
  - Requires session auth (returns 401 without).
- `server/spec/services/push_service_spec.rb`:
  - Asserts agent capability filtering for all nullable fields.

**Exit criteria:**

- `MetricsAggregator` has no string literal agent IDs; everything goes through `AgentRegistry`.
- A new metric in `agents.yaml` automatically participates in capability filtering.
- `task_cycle_time_join_for` is a method, not a hash; produces identical SQL for nil/claude_code/copilot_cli vs the previous constant.
- `/api/v1/agents` returns the registry.

**Common gotchas:**

- Brakeman: the `task_cycle_time_join_for` builder uses string interpolation. Use `ActiveRecord::Base.connection.quote(agent_type)` for safe parameterization. If Brakeman still flags it, add `# brakeman:disable SQLInjection — quoted via connection.quote`. As a fallback, validate `agent_type` against `AgentRegistry::VALID_IDS` before interpolation.
- The current code uses `Arel.sql(...)` extensively for the brakeman safety. The new method-based picks must continue to wrap their results in `Arel.sql(...)` and have brakeman comments where needed. Run `just server-brakeman` after each change.
- The `metric_supported_by_any?` check is needed for the dashboard's "show this metric in the overview" list; ensure `MetricsAggregator` returns nil-but-present entries for unsupported metrics so the dashboard's `metrics` keys remain stable.
- When `@agent_type` is set, `aggregate_session` may receive an empty `session_metrics_for_query` map (if every metric requires a field the agent doesn't supply). Guard against that — return `{}` early.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 4 of plans/multi-agent-abstractions.md (Server: capability-aware push
validation + aggregator) in the worktree at <path>.

Phases 1, 2, 3 must be merged. Read "Capability matrix wiring" and "Phase 4" sections.

Constraints:
  - SESSION_METRIC_EXPRESSIONS shape change requires updating every place that reads
    its values. Grep for SESSION_METRIC_EXPRESSIONS to find all callers.
  - task_cycle_time_join_for must produce SQL byte-identical to today's hash entries
    for the keys nil, "claude_code", "copilot_cli". Add a snapshot test asserting this.
  - Run `just server-brakeman` after each major change. Do not silence findings without
    documenting why in a code comment.
  - The /api/v1/agents endpoint must require session auth, not API-key auth (it's used
    by the dashboard, not the CLI).

After:
  - just server-test && just server-brakeman && just server-lint
```

---

### Phase 5 — Dashboard: capability-aware filter + NULL rendering

**Goal:** the dashboard shows the right filter for each metric (only agents supporting it), renders unsupported metrics as "N/A" with a tooltip, and adds per-agent badges with colors.

**Files to create:**

- `dashboard/src/components/agent-badge.tsx` — small pill component reading `AGENT_LABELS` and `AGENT_COLORS`.
- `dashboard/src/components/__tests__/agent-badge.test.tsx`

**Files to edit:**

- `dashboard/src/components/agent-type-filter.tsx` — accept optional `agents?: readonly AgentType[]` prop; default to `ALL_AGENTS`. Replace hardcoded radio items with `agents.map`.
- `dashboard/src/app/(app)/[slug]/me/metrics/[metric]/page.tsx`:
  - Line 102 area: replace `isSession && <AgentTypeFilter current={agentType} />` with the capability-aware version (see "Capability matrix wiring → Dashboard side").
- `dashboard/src/app/(app)/[slug]/teams/[team]/metrics/[metric]/page.tsx` — same treatment.
- `dashboard/src/app/(app)/[slug]/metrics/[metric]/page.tsx` — same.
- `dashboard/src/app/demo/me/metrics/[metric]/page.tsx` — mirror the change (project rule: demo matches real).
- `dashboard/src/app/demo/teams/[team]/metrics/[metric]/page.tsx` — same.
- `dashboard/src/app/demo/metrics/[metric]/page.tsx` — same.
- `dashboard/src/components/metric-card.tsx` — when `value === null` and `isUnsupportedForFilter` (passed in or derived from props), render `<span title="Not available for {label} sessions">N/A</span>` instead of the existing `?? "—"`.
- `dashboard/src/components/overview-metrics-grid.tsx` — pass agent context down so `metric-card` can compute the unsupported state.
- Session-list rendering (find via grep `agent_type` in components/pages) — add `<AgentBadge id={session.agent_type} />` in any session row UI.
- `dashboard/src/lib/mock/data.ts:532` — replace `idx % 3 === 0 ? "copilot_cli" : "claude_code"` with `ALL_AGENTS[idx % ALL_AGENTS.length]`. Mock data must produce realistic NULLs for capability-false fields per the registry. Add a small helper:
  ```ts
  function maybeNull<T>(agentId: AgentType, field: string, value: T): T | null {
    return AGENT_CAPABILITIES[agentId].fields[field] ? value : null;
  }
  ```

**Files to delete:** none.

**Tests:**

- `agent-type-filter.test.tsx` — when given `agents={["claude_code"]}`, only renders one radio item plus "All Agents".
- `agent-badge.test.tsx` — renders label, applies background color from registry.
- Snapshot test on a metric-detail page with mock data filtered to a capability-mismatched agent — assert "N/A" appears, not "—".
- Demo page snapshot/visual checks — verify nothing shifts visually for the all-agents view.

**Exit criteria:**

- Filtering metric pages to a single agent shows N/A on unsupported tiles with hover-explanation.
- Real and demo pages match.
- Per-agent badges visible on session lists.
- Visual review against ADR-015 Parchment & Clay theme — colors don't clash.

**Common gotchas:**

- `AgentTypeFilter` already uses `useRouter`/`useSearchParams` — preserve that. Just add the `agents` prop.
- Demo app: any change to a real metric-detail page MUST be mirrored. Per CLAUDE.md "/demo app should _exactly_ (wherever possible) match." Failure to mirror is a CI/review red flag.
- NULL vs zero in mock data: pre-existing mocks may have `input_tokens: 5000` for Copilot — that's fine (Copilot DOES supply input_tokens). Only set null for agents whose capability is `false`. The Cursor entry isn't in the registry yet (Phase 7); mock generator using `ALL_AGENTS` won't produce Cursor sessions.
- Color-coding: pick `color` values in `agents.yaml` that meet AA contrast on Parchment background. Confirm with the THEME.md guide before merging.
- shadcn/ui dropdown: the existing component uses `DropdownMenuRadioItem` — ensure `agents.map(...)` retains keys (`key={id}`).
- `metric-card.tsx` may not currently know which agent filter is active. May need to thread `currentAgent?: AgentType` through props from the page-level component. Keep the prop optional so unfiltered views skip the unsupported-N/A logic.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 5 of plans/multi-agent-abstractions.md (Dashboard: capability-aware
filter + NULL rendering) in the worktree at <path>.

Phases 1-4 must be merged.

Constraints:
  - Every change to a real metric/page must be mirrored in the demo equivalent.
    Project rule (CLAUDE.md): "The /demo app should _exactly_ (wherever possible)
    match the real app's functionality."
  - Use semantic tokens from dashboard/THEME.md for any new colors. Read THEME.md
    before adding color rules.
  - Run `just dashboard-typecheck` after each TS change.
  - For the AGENT_COLORS values in agents.yaml: verify AA contrast on Parchment
    background.

After:
  - just dashboard-test && just dashboard-typecheck && just dashboard-build
  - Visual smoke: just dashboard-mock; open localhost:3333; click through metric pages
    with each agent filter and verify N/A appears appropriately.

Do not run dashboard-dev — this is a worktree and node_modules may not be installed.
Run `npm install --prefix <worktree-path>/dashboard` first if needed.
```

---

### Phase 6 — Hook installer interface refactor

**Goal:** introduce `hooks.Installer`, move `hooks.go` and `copilot_hooks.go` into per-agent packages behind the interface, and refactor the `ax init` and `--uninstall` paths to iterate registered installers.

**Files to create:**

- `cli/internal/hooks/installer.go` — interface + `Scope` enum.
- `cli/internal/hooks/installers.go` — `RegisteredInstallers()`.
- `cli/internal/hooks/pushcommand/script.go` — parameterized bash one-liner.
- `cli/internal/hooks/pushcommand/script_test.go`
- `cli/internal/hooks/claude/installer.go` — moved from `hooks.go`.
- `cli/internal/hooks/claude/installer_test.go` — moved from `hooks_test.go`, repointed.
- `cli/internal/hooks/copilot/installer.go` — moved from `copilot_hooks.go`.
- `cli/internal/hooks/copilot/installer_test.go`

**Files to edit:**

- `cli/cmd/ax/main.go:160-182` (initManagedMode) — replace with installer-iteration loop.
- `cli/cmd/ax/main.go:88-91` (--uninstall path) — replace with iteration.

**Files to delete:**

- `cli/internal/hooks/hooks.go` (after moving Claude installer).
- `cli/internal/hooks/copilot_hooks.go` (after moving Copilot installer).
- `cli/internal/hooks/hooks_test.go` (after moving tests).

**Code sketch — Claude installer:**

```go
// cli/internal/hooks/claude/installer.go
package claude

import (
    "github.com/austinroos/ax/internal/agents"
    "github.com/austinroos/ax/internal/hooks"
    "github.com/austinroos/ax/internal/hooks/pushcommand"
)

type Installer struct{}

func NewInstaller() *Installer { return &Installer{} }

func (i *Installer) AgentID() agents.AgentID { return agents.ClaudeCode }
func (i *Installer) Scopes() hooks.Scope { return hooks.UserScope }

func (i *Installer) HomeExists() bool {
    home, _ := os.UserHomeDir()
    _, err := os.Stat(filepath.Join(home, ".claude"))
    return err == nil
}

func (i *Installer) Install(ctx hooks.InstallContext) (hooks.Installed, error) {
    settingsPath := filepath.Join(ctx.HomeDir, ".claude", "settings.json")
    cmd := pushcommand.Build(pushcommand.Spec{
        AxBinary:       ctx.AxBinary,
        WorktreeMarker: "/.claude/worktrees/",
    })
    // ... existing Install logic, but using cmd from pushcommand.Build()
    return hooks.Installed{Path: settingsPath, Created: true, Message: ""}, nil
}

func (i *Installer) Uninstall(ctx hooks.InstallContext) error { /* existing */ }
func (i *Installer) IsInstalled(ctx hooks.InstallContext) bool { /* existing */ }
```

**Tests:**

- `pushcommand/script_test.go`:
  - With `WorktreeMarker: "/.claude/worktrees/"` produces output containing the sed worktree fallback.
  - With empty `WorktreeMarker` does not.
  - Output is shell-parseable (`bash -n`).
- All existing hook tests pass after relocation.
- New `installers_test.go`:
  - `RegisteredInstallers` returns claude + copilot.
  - Iteration calls `Install` only on installers whose `HomeExists()` is true (use a fake-installer pattern).

**Exit criteria:**

- `cli/cmd/ax/main.go` contains no `hooks.Install`, `hooks.InstallCopilot`, `hooks.CopilotHomeExists`, or `hooks.UninstallCopilot` direct calls — only iteration over `RegisteredInstallers()`.
- All existing install/uninstall behavior preserved (tests pass).
- The bash one-liner is generated from `pushcommand.Build`, not duplicated across installers.

**Common gotchas:**

- The bash one-liner is a long, fragile string. When extracting into `pushcommand.Build`, preserve quoting EXACTLY. Test by running `bash -n -c "<output>"` to confirm parses without error.
- `IsInstalled` for Claude reads three different status-message strings (legacy detection). Preserve all three checks in the moved code.
- The Copilot installer's `isAXCopilotHook` check verifies only one entry under `sessionEnd` and `Bash` contains `"ax push --repo"`. The new `pushcommand.Build` output is significantly longer (worktree + logging) than the current Copilot one-liner (`ax push --repo .`). Decide whether Copilot moves to the richer one-liner or keeps the simple form. **Recommendation**: keep Copilot simple for now (`ax push --repo .`). Only Claude needs worktree handling. Pass `WorktreeMarker: ""` from Copilot's installer; the Build output will be the simple form.
- `--scope=repo` flag for Cursor lands in Phase 7, not here. The `Scope` enum supports it; the iteration in `main.go` correctly skips installers that don't declare a given scope. Phase 6 ships installers for Claude (UserScope only) and Copilot (RepoScope only), so neither agent has scope ambiguity yet — no CLI flag needed.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 6 of plans/multi-agent-abstractions.md (Hook installer interface refactor)
in the worktree at <path>.

Phases 1, 3 must be merged. Read "Hook installer interface" and "Phase 6" sections.

Constraints:
  - Behavior-preserving for Claude and Copilot users. Existing hook files written by
    earlier ax versions must remain detected as AX-owned.
  - The pushcommand.Build output for Claude must produce the same bash one-liner
    (modulo whitespace) as the current hooks.go pushCommand. Add a test asserting this
    via golden-file fixture.
  - `bash -n -c "<generated>"` must succeed (no syntax errors).
  - Copilot installer keeps the simple "ax push --repo ." form (no worktree handling);
    pass WorktreeMarker: "" to pushcommand.Build.

After:
  - just cli-vet && just cli-test && just cli-build
  - Manually test: build ax, run `ax init` against a test claude+copilot setup, verify
    hooks land in the right files; run `ax init --uninstall` and verify removal.
```

---

### Phase 7 — Cursor provider

**Goal:** add the Cursor entry to `agents.yaml`, build `cli/internal/agents/cursor/`, add the Cursor installer, push real Cursor sessions end-to-end.

**Files to create:**

- `cli/internal/agents/cursor/provider.go`
- `cli/internal/agents/cursor/discovery.go`
- `cli/internal/agents/cursor/parser.go`
- `cli/internal/agents/cursor/applypatch.go`
- `cli/internal/agents/cursor/tools.go`
- `cli/internal/agents/cursor/cursor_test.go`
- `cli/internal/agents/cursor/testdata/transcript.jsonl` — minimal Cursor transcript fixture.
- `cli/internal/hooks/cursor/installer.go`
- `cli/internal/hooks/cursor/installer_test.go`

**Files to edit:**

- `config/agents.yaml` — add the `cursor_cli:` entry (full content shown earlier in this plan).
- Run `just codegen-agents` and commit the regenerated `*.gen.*` files.
- `cli/internal/agents/providers.go` — register `cursor.New()`.
- `cli/internal/hooks/installers.go` — register `cursor.NewInstaller()`.
- `dashboard/src/lib/mock/data.ts` — generation now includes Cursor sessions automatically (via `ALL_AGENTS`); spot-check that mock Cursor sessions correctly NULL token fields per the registry.
- `cli/cmd/ax/main.go` — add `--scope` string flag to `ax init` (values: `user` (default), `repo`, `both`). When set to `repo` or `both`, the installer-iteration loop passes the appropriate `hooks.Scope` to installers that declare it. Single-scope installers (Claude, Copilot) ignore the flag — the loop already skips scopes the installer doesn't support. Default `user` matches resolved decision #3.
- `cli/cmd/ax/main.go` (uninstall path) — `ax init --uninstall` removes hooks from EVERY scope an installer supports, regardless of the original install scope. (Best-effort cleanup; don't require users to remember which scope they installed.)

**Files to delete:** none.

**Cursor on-disk reference (verbatim from research doc, for parser sketch context):**

```
~/.cursor/
  cli-config.json
  agent-cli-state.json
  prompt_history.json
  ai-tracking/ai-code-tracking.db        (Phase 8 only)
  chats/<workspace-hash>/<agent-uuid>/store.db
  projects/
    <encoded-project-path>/              # encoding: leading / stripped, "/" → "-"
      .workspace-trusted                 # JSON: { workspacePath, trustedAt }
      repo.json                          # { id: <uuid> }
      worker.log
      agent-transcripts/
        <agent-uuid>/<agent-uuid>.jsonl  # the transcript
```

Path encoding example: `/Users/austinroos/dev/ax` → `Users-austinroos-dev-ax`.

Transcript JSONL line shapes (minimum to support):

- User message:
  ```json
  {"role":"user","message":{"content":[{"type":"text","text":"<timestamp>2026-04-01T10:00:00Z</timestamp>\n<user_query>...</user_query>"}]}}
  ```
- Assistant message with tool calls:
  ```json
  {"role":"assistant","message":{"content":[
    {"type":"text","text":"..."},
    {"type":"tool_use","name":"ReadFile","input":{"path":"/Users/.../README.md"}},
    {"type":"tool_use","name":"Glob","input":{"glob_pattern":"*.md","target_directory":"/Users/.../ax"}},
    {"type":"tool_use","name":"ApplyPatch","input":{"patch":"*** Begin Patch\n*** Update File: /tmp/foo.txt\n@@ ... @@\n+...\n*** End Patch"}},
    {"type":"tool_use","name":"Shell","input":{"command":"git status","working_directory":"/tmp/foo","description":"check status"}}
  ]}}
  ```

Notably absent: per-message timestamps (only embedded in user text), `usage` block (no token data), `tool_result` lines (Cursor excludes these by design), per-message UUIDs.

**Code sketch — Cursor provider:**

```go
package cursor

import (
    "os"
    "path/filepath"
    "strings"

    "github.com/austinroos/ax/internal/agents"
    "github.com/austinroos/ax/internal/parsers"
)

const id = agents.AgentID("cursor_cli")

type Provider struct{}

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

// encodePath does Cursor's path encoding: leading "/" stripped, then "/" → "-".
// Different from Claude's encoding (which prefixes "-" and also replaces ".").
func encodePath(absPath string) string {
    p := strings.TrimPrefix(absPath, "/")
    return strings.ReplaceAll(p, "/", "-")
}

func (p *Provider) DiscoverSessions(target agents.DiscoveryTarget) ([]agents.SessionLocator, error) {
    if target.LocalPath == "" {
        return nil, nil
    }
    encoded := encodePath(target.LocalPath)
    projectDir := filepath.Join(p.HomeDir(), "projects", encoded, "agent-transcripts")
    entries, err := os.ReadDir(projectDir)
    if err != nil {
        if os.IsNotExist(err) { return nil, nil }
        return nil, err
    }
    var locs []agents.SessionLocator
    for _, ent := range entries {
        if !ent.IsDir() { continue }
        agentUUID := ent.Name()
        transcriptPath := filepath.Join(projectDir, agentUUID, agentUUID+".jsonl")
        if _, err := os.Stat(transcriptPath); err != nil { continue }
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
    if err != nil { return nil, err }
    sess.AgentType = string(id)
    return sess, nil
}

func (p *Provider) Capabilities() agents.Capabilities {
    return agents.Registry()[id].Capabilities
}

// RepoEnumerator implementation — Cursor lets us walk the projects directory
// and derive owner/repo for each project via target.GitRemoteFn.
func (p *Provider) DiscoverAllRepos() ([]agents.RepoLocator, error) {
    projectsRoot := filepath.Join(p.HomeDir(), "projects")
    entries, err := os.ReadDir(projectsRoot)
    if err != nil {
        if os.IsNotExist(err) { return nil, nil }
        return nil, err
    }
    var repos []agents.RepoLocator
    for _, ent := range entries {
        if !ent.IsDir() { continue }
        // Decode the project path
        decoded := "/" + strings.ReplaceAll(ent.Name(), "-", "/")
        // Read .workspace-trusted to confirm cwd
        wsPath := filepath.Join(projectsRoot, ent.Name(), ".workspace-trusted")
        if data, err := os.ReadFile(wsPath); err == nil {
            // parse JSON for workspacePath, prefer that over decoded heuristic
            var ws struct{ WorkspacePath string `json:"workspacePath"` }
            if json.Unmarshal(data, &ws) == nil && ws.WorkspacePath != "" {
                decoded = ws.WorkspacePath
            }
        }
        // Owner/repo derivation deferred to caller via GitRemoteFn (passed in
        // DiscoveryTarget). For DiscoverAllRepos, the caller will run git remote
        // on RepoLocator.LocalPath.
        repos = append(repos, agents.RepoLocator{LocalPath: decoded})
    }
    return repos, nil
}
```

> **Path-decoding caveat**: `strings.ReplaceAll(ent.Name(), "-", "/")` is wrong for paths that legitimately contain `-` in directory names. The `.workspace-trusted` JSON's `workspacePath` is authoritative; only fall back to decoding when that file is missing. Document in code.

**Code sketch — `applypatch.go`:**

```go
package cursor

import (
    "bufio"
    "strings"
)

// ParseApplyPatch extracts file paths modified in a Cursor ApplyPatch input.
// The format is text-based:
//   *** Begin Patch
//   *** Update File: <path>     (or "Add File:", "Delete File:")
//   @@ ...
//   <diff lines>
//   *** End Patch
// Multiple File sections per patch are common.
func ParseApplyPatch(patch string) []string {
    var paths []string
    scanner := bufio.NewScanner(strings.NewReader(patch))
    for scanner.Scan() {
        line := scanner.Text()
        for _, prefix := range []string{"*** Update File: ", "*** Add File: ", "*** Delete File: "} {
            if strings.HasPrefix(line, prefix) {
                paths = append(paths, strings.TrimSpace(strings.TrimPrefix(line, prefix)))
                break
            }
        }
    }
    return paths
}
```

**Code sketch — `parser.go`:**

```go
package cursor

import (
    "bufio"
    "encoding/json"
    "io"
    "os"
    "regexp"
    "strings"
    "time"

    "github.com/austinroos/ax/internal/parsers"
)

type transcriptLine struct {
    Role    string                 `json:"role"`
    Message struct {
        Content json.RawMessage `json:"content"`
    } `json:"message"`
}

type contentBlock struct {
    Type  string          `json:"type"`
    Text  string          `json:"text,omitempty"`
    Name  string          `json:"name,omitempty"`
    Input json.RawMessage `json:"input,omitempty"`
}

var timestampRe = regexp.MustCompile(`<timestamp>([^<]+)</timestamp>`)

func parseTranscript(path, sessionID string) (*parsers.ParsedSession, error) {
    f, err := os.Open(path)
    if err != nil { return nil, err }
    defer f.Close()

    sess := &parsers.ParsedSession{
        ID:        sessionID,
        ToolCalls: make(map[string]int),
    }

    filesReadSet := make(map[string]bool)
    filesModifiedSet := make(map[string]bool)
    var lastWasUser bool

    scanner := bufio.NewScanner(f)
    scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
    for scanner.Scan() {
        var line transcriptLine
        if err := json.Unmarshal(scanner.Bytes(), &line); err != nil { continue }
        var blocks []contentBlock
        if err := json.Unmarshal(line.Message.Content, &blocks); err != nil { continue }

        switch line.Role {
        case "user":
            sess.HumanMessages++
            lastWasUser = true
            // Extract embedded timestamp from first text block
            for _, b := range blocks {
                if b.Type == "text" {
                    if ts := extractFirstTimestamp(b.Text); ts > 0 {
                        if sess.StartedAt == 0 || ts < sess.StartedAt {
                            sess.StartedAt = ts
                        }
                        if ts > sess.EndedAt { sess.EndedAt = ts }
                    }
                    break
                }
            }
        case "assistant":
            sess.AssistantMessages++
            if lastWasUser { sess.TurnCount++; lastWasUser = false }
            for _, b := range blocks {
                if b.Type != "tool_use" { continue }
                sess.ToolCalls[b.Name]++
                applyTool(b, sess, filesReadSet, filesModifiedSet)
            }
        }
    }
    if err := scanner.Err(); err != nil && err != io.EOF { return nil, err }

    for f := range filesReadSet { sess.FilesRead = append(sess.FilesRead, f) }
    for f := range filesModifiedSet { sess.FilesModified = append(sess.FilesModified, f) }

    // Tool category tallying — read from cursorToolMap
    for name, count := range sess.ToolCalls {
        sess.TotalToolCalls += count
        // Cursor has no Agent/Skill/MCP yet; categorization is read/modify/shell only.
    }

    return sess, nil
}

func extractFirstTimestamp(text string) int64 {
    m := timestampRe.FindStringSubmatch(text)
    if len(m) < 2 { return 0 }
    t, err := time.Parse(time.RFC3339, m[1])
    if err != nil { return 0 }
    return t.UnixMilli()
}

func applyTool(b contentBlock, sess *parsers.ParsedSession, reads, mods map[string]bool) {
    switch b.Name {
    case "ReadFile":
        var inp struct{ Path string `json:"path"` }
        if json.Unmarshal(b.Input, &inp) == nil && inp.Path != "" {
            reads[inp.Path] = true
            sess.TotalFileReads++
        }
    case "Glob":
        // Not counted toward FilesRead — Glob doesn't read specific files.
    case "ApplyPatch":
        var inp struct{ Patch string `json:"patch"` }
        if json.Unmarshal(b.Input, &inp) == nil {
            for _, p := range ParseApplyPatch(inp.Patch) {
                mods[p] = true
            }
        }
    case "Shell":
        // Not extracted in Phase 7. PR-URL/commit-SHA extraction requires tool
        // results which Cursor excludes from the transcript.
    }
}
```

**Code sketch — `tools.go`:**

```go
package cursor

// Cursor's tool taxonomy. Categories match AX's internal taxonomy:
//   Read:   ReadFile, Glob
//   Modify: ApplyPatch (unified create+edit)
//   Shell:  Shell
// Cursor has no subagent or skill tool as of April 2026.
// MCP naming TBD; if observed, add prefix-detection in parser.go.
```

(File can stay nearly empty; categorization is currently inline. Make a `ToolMap` declarative shape if Phase 3's refactor created a shared one — match that pattern.)

**Code sketch — Cursor installer:**

```go
package cursor

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"

    "github.com/austinroos/ax/internal/agents"
    "github.com/austinroos/ax/internal/hooks"
    "github.com/austinroos/ax/internal/hooks/pushcommand"
)

type Installer struct{}

func NewInstaller() *Installer { return &Installer{} }

func (i *Installer) AgentID() agents.AgentID { return agents.CursorCli }
func (i *Installer) Scopes() hooks.Scope { return hooks.UserScope | hooks.RepoScope }

func (i *Installer) HomeExists() bool {
    home, _ := os.UserHomeDir()
    _, err := os.Stat(filepath.Join(home, ".cursor"))
    return err == nil
}

// Cursor hook file shape (per Cursor docs Jan 2026):
//   {
//     "version": 1,
//     "hooks": {
//       "sessionEnd": [
//         { "type": "command", "command": "ax push --repo ." }
//       ]
//     }
//   }
// User scope: ~/.cursor/hooks.json
// Repo scope: <repo>/.cursor/hooks.json

type cursorHookFile struct {
    Version int                            `json:"version"`
    Hooks   map[string][]cursorHookEntry `json:"hooks"`
}

type cursorHookEntry struct {
    Type    string `json:"type"`
    Command string `json:"command"`
}

func (i *Installer) Install(ctx hooks.InstallContext) (hooks.Installed, error) {
    var hookPath string
    switch ctx.Scope {
    case hooks.UserScope:
        hookPath = filepath.Join(ctx.HomeDir, ".cursor", "hooks.json")
    case hooks.RepoScope:
        hookPath = filepath.Join(ctx.RepoPath, ".cursor", "hooks.json")
    default:
        return hooks.Installed{}, fmt.Errorf("cursor installer: unsupported scope %d", ctx.Scope)
    }

    cmd := pushcommand.Build(pushcommand.Spec{
        AxBinary:       ctx.AxBinary,
        WorktreeMarker: "", // Cursor doesn't have an AX-managed worktree convention
    })
    file := cursorHookFile{
        Version: 1,
        Hooks: map[string][]cursorHookEntry{
            "sessionEnd": {{Type: "command", Command: cmd}},
        },
    }
    if err := os.MkdirAll(filepath.Dir(hookPath), 0o755); err != nil {
        return hooks.Installed{}, err
    }
    data, _ := json.MarshalIndent(file, "", "  ")
    if err := os.WriteFile(hookPath, append(data, '\n'), 0o644); err != nil {
        return hooks.Installed{}, err
    }
    return hooks.Installed{Path: hookPath, Created: true}, nil
}

// Uninstall, IsInstalled mirror Copilot's pattern (detect by command containing "ax push").
```

**Tests:**

- `cursor_test.go`:
  - `TestParseTranscript` — uses `testdata/transcript.jsonl` with one user message, one assistant message containing ReadFile + ApplyPatch + Shell tool calls. Asserts `HumanMessages == 1`, `AssistantMessages == 1`, `TurnCount == 1`, `FilesRead == ["/path/from/readfile/input"]`, `FilesModified == [paths from ApplyPatch]`, `ToolCalls["ReadFile"] == 1`, etc.
  - `TestExtractFirstTimestamp` — timestamp embedded in user text is recovered.
  - `TestParseApplyPatch` — Update + Add + Delete File sections each surface their path.
  - `TestProviderHomeExistsRespectsCURSOR_HOME` — env override.
  - `TestProviderDiscoverSessionsFindsTranscripts` — set up tempdir matching the path encoding.
  - `TestProviderParseSetsAgentType`.
- `cursor/installer_test.go`:
  - `TestInstallUserScope` — writes to `<home>/.cursor/hooks.json`.
  - `TestInstallRepoScope` — writes to `<repo>/.cursor/hooks.json`.

**Exit criteria:**

- `ax push --repo .` (in a repo with Cursor sessions) successfully discovers and parses Cursor sessions.
- The push payload includes Cursor sessions with capability-correct fields (token columns nil, sidechain nil, peak_context_pct nil).
- Server accepts the payload; `sessions` rows for `agent_type=cursor_cli` exist in the DB.
- Dashboard shows Cursor sessions with appropriate N/A on token-derived metrics.
- Hooks install for both user and repo scope without error.

**Common gotchas:**

- Path encoding: Cursor uses `Users-austinroos-dev-ax` (no leading dash, no dot replacement). DIFFERENT from Claude. Test with paths containing dots (e.g., `~/.config/myproj`) — Cursor leaves the dots intact; Claude replaces them. The plan's encoding must match Cursor's actual behavior — verify against a real `~/.cursor/projects/` directory before committing.
- Cursor transcripts are NOT hierarchical (no `parentUuid`). Don't try to reconstruct turn trees.
- `lastWasUser` tracking for `TurnCount`: a user message followed by multiple assistant messages still counts as one turn. The code above handles this; verify in tests.
- `Shell` command's `working_directory` field is Cursor-specific. We don't currently use it.
- `ApplyPatch` is unified create-and-edit. We count modifications via `FilesModified`. Don't try to distinguish creates vs updates in Phase 7 (the patch text knows but we don't need to).
- Hook event flakiness: Cursor's `sessionEnd` reportedly doesn't fire reliably in CLI mode (Jan 2026). Document in setup docs (Phase 9). Provide manual `ax push --repo .` as fallback. Don't try to fix Cursor's bug.
- Worktree handling: Cursor doesn't have an AX-managed worktree convention. Don't try to add one. Plain `git worktree` directories are seen as separate Cursor projects.
- `RepoEnumerator` implementation: the `ent.Name()` decoded path is approximate; trust `.workspace-trusted` JSON's `workspacePath` first (resolved decision #9). If both are missing, OR if `GitRemoteFn` fails on the resolved path, **skip the project entirely** — no synthesized owner/repo, no half-known push. Skip is silent in normal runs; log when verbose.
- `--scope` flag default: `user`. Resolved decision #3 — repo-scope creates a committable file the team must opt into. Don't surprise users.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 7 of plans/multi-agent-abstractions.md (Cursor provider) in the worktree
at <path>.

Phases 1-6 must be merged. Read the entire "Phase 7" section AND the Stress-Test section
of plans/research/multi-agent-abstractions.md before starting (it documents Cursor's
on-disk format and the gotchas).

Constraints:
  - Cursor's path encoding is DIFFERENT from Claude's. Verify against a real ~/.cursor/
    directory if available; otherwise unit-test against the encoding rule (leading slash
    stripped; / → -; dots preserved).
  - DO NOT attempt to extract token data, sidechain count, or peak context. Cursor
    doesn't supply these locally; the capability registry says so.
  - DO NOT extract PR URLs / commit SHAs from tool results. Cursor's transcript excludes
    tool_result lines by design (per Cursor docs).
  - The Cursor hook may be flaky in CLI mode — document this in the setup guide (Phase
    9) but don't try to fix Cursor.
  - Implement RepoEnumerator on the Cursor provider; trust `.workspace-trusted` JSON's
    workspacePath over decoded directory names.

After:
  - just codegen-agents (Cursor entry added to agents.yaml)
  - just cli-vet && just cli-test && just cli-build
  - just server-test (Cursor sessions should round-trip; nothing in server should
    require changes — capability matrix handles it)
  - just dashboard-test && just dashboard-typecheck
  - Smoke test: `ax push --repo <real-repo-with-cursor-sessions>` if available;
    otherwise verify via the integration test fixture.
```

---

### Phase 8 — Cursor extras (commit attribution + summary)

**Goal:** read Cursor's `~/.cursor/ai-tracking/ai-code-tracking.db` and land per-commit AI attribution + conversation summary in the `extras` JSONB column. No dashboard surfacing yet.

**Files to create:**

- `cli/internal/agents/cursor/aitracking.go`
- `cli/internal/agents/cursor/aitracking_test.go`
- `cli/internal/agents/cursor/testdata/ai-code-tracking.db` — small SQLite fixture.

**Files to edit:**

- `cli/internal/parsers/session.go` — add `Extras map[string]any` field to `ParsedSession`; pass through in `ToSessionData`.
- `cli/internal/api/types.go` — add `Extras map[string]any \`json:"extras,omitempty"\`` to `SessionData`.
- `cli/internal/agents/cursor/parser.go` — after parsing transcript, call `enrichWithAITracking(session, conversationID)` to attach extras.
- `server/app/services/push_service.rb` — `upsert_sessions` row already includes `extras: s[:extras] || {}` (added Phase 2); confirm.
- `cli/go.mod` / `cli/go.sum` — add `modernc.org/sqlite` (pure-Go SQLite reader, no CGO).

**Files to delete:** none.

**Schema reference (`ai-code-tracking.db`):**

Tables we read:

- `scored_commits(commitHash, branchName, scoredAt, linesAdded, linesDeleted, tabLinesAdded, tabLinesDeleted, composerLinesAdded, composerLinesDeleted, humanLinesAdded, humanLinesDeleted, blankLinesAdded, blankLinesDeleted, commitMessage, commitDate, v1AiPercentage, v2AiPercentage, PRIMARY KEY (commitHash, branchName))`
- `conversation_summaries(conversationId, title, tldr, overview, summaryBullets, model, mode, updatedAt)`

We do NOT need: `ai_code_hashes`, `tracked_file_content`, `tracking_state`.

**Code sketch — `aitracking.go`:**

```go
package cursor

import (
    "database/sql"
    "encoding/json"
    "os"
    "path/filepath"

    _ "modernc.org/sqlite"  // pure-Go driver, no CGO
)

func openAITrackingDB(homeDir string) (*sql.DB, error) {
    path := filepath.Join(homeDir, "ai-tracking", "ai-code-tracking.db")
    if _, err := os.Stat(path); err != nil { return nil, nil }
    return sql.Open("sqlite", path)
}

type ScoredCommit struct {
    SHA              string  `json:"sha"`
    Branch           string  `json:"branch"`
    LinesAdded       int     `json:"lines_added"`
    LinesDeleted     int     `json:"lines_deleted"`
    HumanLinesAdded  int     `json:"human_lines_added"`
    ComposerLinesAdded int   `json:"composer_lines_added"`
    AiPctV2          float64 `json:"ai_pct_v2"`
    CommittedAt      string  `json:"committed_at"`
}

type ConversationSummary struct {
    Title string `json:"title,omitempty"`
    TLDR  string `json:"tldr,omitempty"`
    Model string `json:"model,omitempty"`
}

// fetchExtras reads scored_commits + conversation_summaries for a conversation,
// returning the JSON-serializable extras blob to attach to ParsedSession.
func fetchExtras(homeDir, conversationID string) (map[string]any, error) {
    db, err := openAITrackingDB(homeDir)
    if err != nil || db == nil { return nil, nil }
    defer db.Close()

    extras := map[string]any{}

    // conversation_summary
    var summary ConversationSummary
    row := db.QueryRow(`SELECT title, tldr, model FROM conversation_summaries WHERE conversationId = ?`, conversationID)
    if err := row.Scan(&summary.Title, &summary.TLDR, &summary.Model); err == nil {
        extras["conversation_summary"] = summary
    }

    // scored_commits (we need a way to map conversation_id → commits; in the
    // observed schema, scored_commits has no conversationId column. Cursor maps
    // commits to conversations via ai_code_hashes.requestId/conversationId. For
    // Phase 8 V1, we attach ALL recent commits within the session's time window
    // and let the dashboard filter later. Refine in a follow-up.)
    rows, err := db.Query(`
        SELECT commitHash, branchName, linesAdded, linesDeleted,
               humanLinesAdded, composerLinesAdded, v2AiPercentage, commitDate
        FROM scored_commits
        WHERE scoredAt >= ? AND scoredAt <= ?
        ORDER BY commitDate DESC
        LIMIT 100
    `, /* sess.StartedAt */, /* sess.EndedAt */)
    if err == nil {
        defer rows.Close()
        var commits []ScoredCommit
        for rows.Next() {
            var c ScoredCommit
            if err := rows.Scan(&c.SHA, &c.Branch, &c.LinesAdded, &c.LinesDeleted,
                &c.HumanLinesAdded, &c.ComposerLinesAdded, &c.AiPctV2, &c.CommittedAt); err == nil {
                commits = append(commits, c)
            }
        }
        if len(commits) > 0 {
            extras["commit_attribution"] = map[string]any{"commits": commits}
        }
    }

    if len(extras) == 0 { return nil, nil }
    return extras, nil
}
```

> **Schema-walking caveat**: The exact join from session/conversation to `scored_commits` is not fully documented. The implementation above takes a "commits within session time window" approximation. Phase 8's first PR can ship this approximation; a follow-up plan documents the precise mapping after observing more real Cursor data. Document this in the code.

**Tests:**

- `aitracking_test.go`:
  - `TestFetchExtrasReadsConversationSummary` — set up a temp ai-code-tracking.db with one conversation_summaries row, assert recovered.
  - `TestFetchExtrasReadsScoredCommits` — same with scored_commits.
  - `TestFetchExtrasMissingDBReturnsNil` — no DB → no error, nil extras.
  - `TestExtrasIntegratedIntoParsedSession` — full provider Parse with the test DB present.

**Exit criteria:**

- `sessions.extras->'commit_attribution'` populated for Cursor sessions in dev when ai-code-tracking.db exists.
- `sessions.extras->'conversation_summary'` populated similarly.
- Existing Claude/Copilot sessions still have `extras = {}` (no regression).
- No new metric in the dashboard yet — extras is a landing zone.

**Common gotchas:**

- `modernc.org/sqlite` is a pure-Go SQLite driver. It uses `database/sql` — confirm the import path is `_ "modernc.org/sqlite"` and not `"github.com/mattn/go-sqlite3"` (CGO).
- The driver name is `"sqlite"` (modernc) vs `"sqlite3"` (mattn). Use the former.
- The sqlite file may be open in Cursor's own process — use read-only mode (`?mode=ro` query param) to avoid locking. Update the `sql.Open` call: `sql.Open("sqlite", path+"?mode=ro&immutable=1")`.
- Schema can change between Cursor versions. Code defensively (`Scan` errors → skip row, don't crash).
- Time-window correlation between session and commits is approximate. Don't claim precision we don't have.
- Pure-Go SQLite increases the CLI binary size by ~3-5 MB. Acceptable.
- For test fixtures: the codegen-agents script doesn't need to know about SQLite. Just the Cursor provider's tests do.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 8 of plans/multi-agent-abstractions.md (Cursor extras: commit attribution
+ summary) in the worktree at <path>.

Phase 7 must be merged.

Constraints:
  - Use modernc.org/sqlite (pure Go, no CGO). Driver name is "sqlite".
  - Open the DB read-only and immutable: ?mode=ro&immutable=1 query string.
  - Don't surface any new dashboard UI; this phase only lands data in extras.
  - The conversation→commits mapping is approximate (time window). Document the
    approximation in code; do not over-claim.
  - extras must round-trip through PushService into the JSONB column.

Ensure existing Claude/Copilot push tests still pass (extras stays {} for them).

After:
  - just cli-vet && just cli-test && just cli-build
  - just server-test (verify extras column persists)
  - Manual test: run against a real ~/.cursor with ai-code-tracking.db; query the DB
    after push to verify extras populated.
```

---

### Phase 9 — Documentation + ADR

**Goal:** ADR-018 written; wiki updated; setup docs mention Cursor.

**Files to create:**

- `docs/decisions/018-multi-agent-abstractions.md` — full ADR following `docs/decisions/TEMPLATE.md`.

**Files to edit:**

- `docs/decisions/005-session-ingestion-strategy.md` — add note: now generalized via agent providers.
- `docs/decisions/009-token-cost-metrics.md` — add note: tokens are agent-capability-gated.
- `wiki/architecture.md` — add the registry + provider diagram (described in "Architecture overview" above).
- `wiki/data-flow.md` — show registry → codegen → CLI/server/dashboard.
- `wiki/go-cli.md` — new section "Adding a new agent" with the four steps.
- `wiki/conventions.md` — add codegen rule (don't hand-edit `*.gen.*`); mention optional pre-commit hook.
- `docs/setup.md` — add Cursor section (`~/.cursor/hooks.json`), document the `sessionEnd` flakiness.
- `README.md` (project root): "What is this?" section now mentions three supported agents.
- `CLAUDE.md` — add section on the agent registry workflow if missing.

**Wiki — "Adding a new agent" runbook (paste into `wiki/go-cli.md`):**

```markdown
## Adding a new agent

1. Add the agent's entry to `config/agents.yaml` (use existing entries as templates).
2. Run `just codegen-agents` and commit the regenerated `*.gen.*` files.
3. Implement `cli/internal/agents/<id>/{provider.go, discovery.go, parser.go, tools.go}`.
4. Implement `cli/internal/hooks/<id>/installer.go` (skip if the agent has no hook system).
5. Register both in `cli/internal/agents/providers.go` and `cli/internal/hooks/installers.go`.
6. Add tests in `cli/internal/agents/<id>/<id>_test.go` and `cli/internal/hooks/<id>/installer_test.go`.
7. Update `docs/setup.md` with the install instructions for the new agent.
```

**Tests:** none new.

**Exit criteria:**

- ADR-018 merged.
- Wiki has actionable "add a new agent" instructions.
- Setup docs mention Cursor.
- New contributor reads the wiki and can add a fourth agent without asking.

**Sonnet sub-agent delegation prompt:**

```
Implement Phase 9 of plans/multi-agent-abstractions.md (Documentation + ADR) in the
worktree at <path>.

Phases 1-8 must be merged.

Constraints:
  - ADR-018 follows docs/decisions/TEMPLATE.md verbatim. Reference plans/multi-agent-
    abstractions.md and plans/research/multi-agent-abstractions.md.
  - Do not invent new ADR sections.
  - Wiki updates should add file paths + line refs where claimed.

After:
  - Read the new ADR end-to-end. Sanity-check against the actual implementation in
    each layer.
```

---

## Cross-cutting concerns

### Tokens NULL vs zero (handled in Phase 2)

Wire format: `*int` pointers. Schema: nullable. Aggregator: `NULLIF` already handles both. Backfill: leave existing zero values; only Cursor rows arrive as NULL.

### `extras` JSONB schema

Convention only. Initial keys for Cursor: `commit_attribution`, `conversation_summary`. Future agents add their own keys. Promotion to a typed column happens when a metric needs the data.

### Server-side ingestion (Cursor Admin API) — out of scope

This plan's `Provider` interface is local-file-pushed only. Server-side polled ingestion (Cursor Enterprise Admin API for tokens; Copilot Business endpoints) is a separate abstraction (`ServerProvider` or similar). A future ADR will design it. Cursor sessions in this plan ship without token data; that's correct, not a gap.

### Pricing model (`pricing.LookupMaxContext`)

Stays Claude-only. Capability registry's `peak_context_pct: false` for Copilot/Cursor handles the rest. If Copilot peak-context-pct becomes desirable later, plug a per-provider `MaxContext()` method into the registry. Out of scope here.

### User's Go familiarity

Phases 3, 6, 7, 8 are Go-heavy. Recommended: Sonnet sub-agents for mechanical refactors; user-driven Opus for design/review. Phases 1, 4, 5, 9 are user-friendly territory.

### Backwards compatibility for in-flight CLI binaries

After Phase 2 ships, old CLI binaries continue to push without `payload_version` (server defaults to 1) and without `*int` pointer behavior (server treats `0` as the value). No coordination required. A future breaking change bumps the version.

---

## Testing strategy

### Per-layer

| Layer | Test command | New test pattern |
|---|---|---|
| Codegen | `just codegen-agents-test` | Golden-file fixtures + schema-violation cases |
| CLI provider | `just cli-test` | Per-agent provider tests under `agents/<id>/<id>_test.go`; integration test in `cmd/ax/main_integration_test.go` snapshots payloads |
| CLI hooks | `just cli-test` | Per-agent installer tests under `hooks/<id>/installer_test.go`; `pushcommand` script bash-syntax check |
| Server | `just server-test` | New specs for `AgentRegistry`, capability-aware aggregator, `/api/v1/agents` endpoint |
| Dashboard | `just dashboard-test && just dashboard-typecheck` | New tests for `AgentTypeFilter` filtering, `agent-badge`, mock-data generation |

### Integration tests

The single most important test is the **golden-fixture push payload integration test** added in Phase 3 step 1. Without it, behavior preservation through Phases 3-7 is unverifiable. It should:

1. Set up a temp `~/.claude` and `~/.copilot` with a small fixture session each.
2. Call the push pipeline with a fake HTTP client that captures the payload.
3. Diff the captured payload against `cli/cmd/ax/testdata/expected_payload.json`.
4. Re-run after each refactor; the test must continue to pass.

In Phase 7, add a Cursor fixture and an expected-payload snapshot to the same test.

### CI sequencing

`just codegen-agents-check` runs first (cheap, fail-fast). Then per-language jobs. Add a `codegen-check` job in `.github/workflows/ci.yml` that does NOT depend on the `changes` filter — generated files affect every layer.

---

## Resolved tactical decisions

The strategic decisions ("Decisions locked in" near the top) drove the architecture. The tactical decisions below were deferred during planning and are now locked in. Changing any of these after implementation starts requires updating the plan first.

1. **Codegen language: Ruby.** Has YAML + ERB built in; user's strongest language; no toolchain to introduce. The script lives at `scripts/codegen-agents/generate.rb`.

2. **Config file format: YAML.** Nested capability maps read better than TOML; aligns with Rails conventions. File path: `config/agents.yaml`.

3. **Cursor hook scope default: UserScope only at install time, with `--scope=repo` opt-in flag.** Rationale: repo-scope creates a `.cursor/hooks.json` file that must be committed to be useful (mirroring Copilot's `.github/hooks/session-end.json`); we don't surprise teams. UserScope mirrors Claude. Teams that want shared install can `ax init --scope=repo`. Implementation: add the flag in Phase 7 alongside the Cursor installer (not Phase 6 — Phase 6 only ships installers with single-scope agents).

4. **Always-show agent badge on session lists: yes.** A small color-coded pill answers "what agent did this come from?" without a click. Cost is one badge per row. Use `AGENT_LABELS` + `AGENT_COLORS` from the registry.

5. **`payload_version` bump rules:** bump for semantic changes (a field's meaning, type, or required-ness changes). Don't bump for additive optional fields. Document in ADR-018 so future contributors have a stable contract. Server keeps every prior-version parser indefinitely.

6. **`agent_type` stays a single string ID.** A tuple (`harness, model_provider, ingestion_mode`) is over-fit for what we need today. When a real harness requires per-session model-provider provenance (Copilot CLI's `/model` switch is the closest case), add a nullable `model_provider` column rather than restructuring `agent_type`. Today's `primary_model` field is sufficient — Copilot's mid-session model switching loses fidelity to "primary" but that's already the case and is not introduced by this plan.

7. **Cursor `store.db` blob format: not reverse-engineered.** The transcript JSONL is enough for the metrics in the capability matrix. Reverse-engineering buys per-message latency and a proper message tree, neither of which currently maps to a metric. If a future metric needs it, that's a research project of its own — see "Out of scope".

8. **CGO for sqlite read: `modernc.org/sqlite` (pure Go).** Keeps the existing `CGO_ENABLED=0` cross-compile in `cli/Justfile`'s `build-all` recipe working unchanged. The ~3-5 MB binary-size increase is a one-time, acceptable cost. Driver name is `"sqlite"`; open with `?mode=ro&immutable=1`.

9. **Cursor `RepoEnumerator` owner/repo derivation:** read `.workspace-trusted` JSON's `workspacePath` first; fall back to decoded directory name only when the file is missing. Run `GitRemoteFn` against the resulting path. If `GitRemoteFn` fails, **skip the project entirely** — don't push half-known data with synthesized `owner/repo` values. The skip is silent (no error surfaced to the user) but logged when verbose mode is on.

10. **Multi-line YAML strings in `agents.yaml`:** not needed for any current value (labels, colors, env names, scope strings, paths all fit on one line). ERB templates use `.dump` (Ruby) for Go output, `.inspect` for Ruby output, and `.to_json` for TS — these handle escapes correctly for single-line strings. **If a future capability adds multi-line content** (e.g., a long description block), switch the relevant template to `.to_json` for safety; multi-line YAML scalars otherwise need explicit escape handling that ERB doesn't do for free.

### Decisions deferred to follow-up plans

These came up during planning but explicitly land outside this plan's scope. They have no current best guess — they need a fresh design conversation when prioritized:

- **`model_provider` column on `sessions`** — needed only when a metric depends on per-session provider attribution. Out of scope here.
- **Server-side ingestion abstraction (`ServerProvider`)** — covers Cursor Admin API + Copilot Business endpoints. Parallel abstraction to `Provider`; see ADR-018 forward-look section.
- **Promotion of `extras` keys to typed columns** — happens per-metric when a metric is built. Out of scope here.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase 3 Go refactor regresses Claude or Copilot push | Medium | High | Golden-fixture integration test added BEFORE moving any code (Phase 3 step 1). Behavior-preserving by design. Canary deploy CLI binary. |
| Cursor's transcript schema changes | Medium | Medium | Pin fixtures; defensive parsing (skip unparseable lines, don't crash); log unknown event types. |
| Codegen drift between agents.yaml and `*.gen.*` files | Medium | Low | CI gate (`codegen-check`); optional pre-commit hook. |
| Hook installer doesn't generalize past three agents | Low | Medium | Cursor's user+repo dual scope is the hardest case we'll encounter for a while. |
| `extras` JSONB becomes a junk drawer | Medium | Low | Convention-only schema; promote keys to typed columns as metrics ship. |
| Server-side ingestion (Cursor Admin) gets prioritized later and Provider abstraction can't accommodate | Medium | Medium | Explicit out-of-scope; future ServerProvider is a parallel abstraction. |
| Cursor `sessionEnd` hook still flaky in CLI mode | Medium | Low | Documented; users fall back to `ax push --repo .`. |
| User's Go inexperience slows Phase 3 | Medium | Medium | Sonnet sub-agent for mechanical refactor; behavior-preserving constraint reduces blast radius. |
| Brakeman flags the `task_cycle_time_join_for` SQL builder | Medium | Low | Use `connection.quote()` + validate against `AgentRegistry::VALID_IDS`. Fall back to per-key hash if Brakeman insists. |
| `modernc.org/sqlite` driver has bugs vs CGO sqlite3 | Low | Low | Driver is widely used; defensive Scan errors. Switch to CGO if hit. |

## Out of scope

- Codex CLI / Aider / Gemini CLI / OpenCode / Windsurf / Trae integrations.
- Cursor Admin API server-side ingestion (Enterprise tokens).
- GitHub Copilot business/enterprise admin endpoints.
- Per-commit AI-authorship as a top-level metric (data lands in `extras` Phase 8; UI in a follow-on plan).
- Plugin/third-party provider packaging (no stable provider ABI).
- Pricing-table generalization for non-Anthropic models (separate ADR).
- Cursor IDE (vs CLI) integration.
- Hook-event normalization across agents.
- Reverse-engineering Cursor's per-chat `store.db` blob format.

## Related decisions

- ADR-005 (Session Ingestion Strategy) — generalized via agent providers in Phase 9 update.
- ADR-009 (Token Cost Metrics) — note added in Phase 9: tokens are agent-capability-gated.
- ADR-013 (GitHub Integration Model) — no change.
- ADR-014 (Remove Local Mode) — no change; this plan is fully managed-only.
- ADR-015 (Design System & shadcn/ui) — Phase 5 dashboard work obeys.
- ADR-017 (Metric Restructuring) — capability matrix uses ADR-017's metric slugs.
- New: ADR-018 — Plug-and-Play Agent Provider System (delivered in Phase 9).

## Deliverables

After all phases ship:

- **Single source of truth**: `config/agents.yaml` is the only place to add an agent.
- **Codegen pipeline**: `just codegen-agents` keeps Go, Ruby, TS, and the SQL fixture in sync; CI gate guarantees no drift.
- **`Provider` interface**: every agent owns its discovery + parsing in `cli/internal/agents/<id>/`.
- **`Installer` interface**: every agent owns its hook install in `cli/internal/hooks/<id>/`.
- **Capability matrix**: gates push validation, metric aggregation, and dashboard rendering.
- **Cursor end-to-end**: sessions push, capability-aware fields, N/A in dashboard for unsupported metrics, commit-attribution in `extras`.
- **Wire-format versioning**: `payload_version` recorded per session; future bumps are safe.
- **A new contributor can add a fifth agent in a single PR** by following `wiki/go-cli.md`.
