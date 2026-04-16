# Research: GitHub Copilot CLI (`@github/copilot`)

Research date: April 2026. Sources linked inline.

## Scope

The new agentic CLI distributed as `@github/copilot` on npm — GA date Feb 25, 2026 ([changelog](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)).

**Not to be confused with** the older `gh copilot suggest/explain` extension to the GitHub CLI — that's a different product with ephemeral one-shot commands and no session concept.

The [`github/copilot-cli`](https://github.com/github/copilot-cli) repo is NOT the source code — it contains only docs/installer/issue-tracker artifacts (`install.sh`, `README.md`, `changelog.md`, `LICENSE.md`, `.github/`). The actual CLI is distributed as a pre-built npm package. Source is closed.

## Install and invocation

- `npm install -g @github/copilot` (also Homebrew, WinGet)
- Auth via GitHub credentials, inherits org policies

Slash commands: `/plan`, `/fleet`, `/delegate`, `/diff`, `/agent`, `/skills`, `/model`, `/mcp`, `/usage`, `/context`, `/resume`, `/session`, `/rename`, `/share`, `/experimental show`, `/changelog`.

## Session storage

- Root config/state dir: `~/.copilot/` (override via `COPILOT_HOME`)
- Session transcripts: `~/.copilot/session-state/` — **JSONL** format
- SQLite index: `~/.copilot/session-store.db` — "a subset of the full data stored in the session files", supports `/chronicle`
- Logs: `~/.copilot/logs/` (override via `--log-dir`)

Sources: [chronicle doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle), [CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference).

**Schema of both files is NOT documented publicly.** The chronicle doc says each session records "your prompts, Copilot's responses, the tools that were used, and details of files that were modified." No field list, no SQL DDL, no JSONL record spec.

[DeepWiki's reconstruction](https://deepwiki.com/github/copilot-cli/3.4-model-selection-and-usage) (third-party reverse-wiki) mentions `~/.copilot/sessions/{id}.jsonl` — conflicts with the docs' `session-state/` path. Treat as approximate until verified empirically.

## Hooks system

Docs: [Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration), [Using hooks with Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks).

**Hook events:**
- `sessionStart` — new or resumed
- `sessionEnd` — complete/terminate; `reason` in `complete` / `error` / `abort` / `timeout` / `user_exit`
- `userPromptSubmitted`
- `preToolUse` — **only hook whose output can block execution** (return `{"permissionDecision": "deny", "permissionDecisionReason": "..."}`)
- `postToolUse` — `toolResult.resultType` in `success` / `failure` / `denied`, plus `textResultForLlm`
- `errorOccurred`

**Config:** `.github/hooks/*.json` in the repo. Example:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "./scripts/on-start.sh",
        "powershell": "./scripts/on-start.ps1",
        "cwd": ".",
        "timeoutSec": 10,
        "env": { "LOG_LEVEL": "INFO" }
      }
    ]
  }
}
```

**Stdin payload fields:** `timestamp` (unix ms), `cwd`, plus event-specific (`source`, `initialPrompt`, `reason`, `prompt`, `toolName`, `toolArgs`, `toolResult`, `error`).

**Critical limitation for AX:** Hooks are documented as **repo-level only** (`.github/hooks/`). No user-level `~/.copilot/hooks.json` equivalent to Claude Code's `~/.claude/settings.json`.

- Cloud agent variant: hooks file "must be present on your repository's default branch"
- CLI: "hooks are loaded from your current working directory"

`ax init`-style global hook installation is not supported. AX would need per-repo hook install.

## Config files

Multiple tiers ([CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference)):

| File | Scope |
|---|---|
| `~/.copilot/config.json` | User global defaults (model, theme, streaming, auto-update, trusted folders) |
| `~/.copilot/mcp-config.json` | User MCP servers |
| `~/.copilot/copilot-instructions.md` | User-level instructions |
| `~/.copilot/skills/` | User skills |
| `~/.copilot/agents/` | User custom agents |
| `.github/copilot/settings.json` | Repo shared config (committed) |
| `.github/copilot/settings.local.json` | Personal overrides (gitignored) |
| `.github/hooks/*.json` | Repo hooks |
| `.github/agents/*.agent.md` | Repo custom agents |
| `.github/skills/` | Repo skills |

**`config.json` schema is not published** — only a prose list of what it controls.

## Session data contents

Per [chronicle doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle):
- Prompts (user messages)
- Copilot responses (assistant messages)
- Tool uses (which tool, arguments)
- Files modified

DeepWiki describes a **MessageLog** (user/assistant messages) and **ToolLog** (tool call names + results), plus per-session `cwd`. Third-party, approximate.

**NOT documented:** exact JSONL record shape, whether each turn carries a timestamp, whether token counts are included, whether model ID is stamped per turn.

## `/resume` feature

- `/resume [SESSION-ID]` (picker if no ID)
- `--resume=SESSION-ID`, `--continue` (resumes most recent)
- `/session` (show session info), `/rename`
- `/share [file|gist]` (export as Markdown or GitHub Gist), `--share=PATH`, `--share-gist`

A past bug pre-v1.0.6 ("Session file is corrupted", [DeepWiki](https://deepwiki.com/github/copilot-cli/3.4-model-selection-and-usage)) implies session IDs correspond to filenames under `~/.copilot/session-state/`.

## Per-session cost / token exposure

**Likely not exposed per turn.** Known surfaces:
- `/usage` slash command and a "Remaining requests" status-bar widget ([CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference))
- Billing is in **"premium requests"** — every prompt counts as 1 (1× multiplier) regardless of model ([DeepWiki](https://deepwiki.com/github/copilot-cli/3.4-model-selection-and-usage))
- `/context` slash command shows "context window token usage and visualization" (live, unclear if persisted)

The chronicle doc makes **no mention** of token counts, dollar cost, or model-per-turn being persisted. For AX's ADR-009 (Token Cost per PR, Unmerged Token Spend), Copilot CLI will likely only surface **request counts**, not actual tokens — unless empirical inspection reveals otherwise.

## Model support

- Multi-provider: Anthropic, Google, OpenAI ([CLI landing page](https://github.com/features/copilot/cli))
- Default: Claude Sonnet 4.5 ([Oct 2025 changelog](https://github.blog/changelog/2025-10-03-github-copilot-cli-enhanced-model-selection-image-support-and-streamlined-ui/))
- `/model` slash command switches mid-session; current model shown above input
- Env var: `COPILOT_MODEL`

**Whether session file records model per assistant turn: NOT documented.** Given multi-model support, reasonable to assume it's recorded — needs empirical verification.

## AGENTS.md / Custom Agents / Skills

Three separate concepts:

**Custom instructions** ([docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)):
- Repo root `AGENTS.md` (primary), also reads `CLAUDE.md` and `GEMINI.md` for cross-tool compat
- `.github/copilot-instructions.md`
- `.github/instructions/**/*.instructions.md` with YAML frontmatter (`applyTo` glob, `excludeAgent`)
- `$HOME/.copilot/copilot-instructions.md`
- Extra dirs via `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`

**Custom agents** ([docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)):
- `.agent.md` files
- User: `~/.copilot/agents/`; repo: `.github/agents/`. User wins on collision.
- Invoked with `@AGENT-NAME` (used by `/fleet`)

**Agent Skills** ([docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills), [Dec 18, 2025 changelog](https://github.blog/changelog/2025-12-18-github-copilot-now-supports-agent-skills/)):
- `SKILL.md` with frontmatter (`name`, `description` required; `license`, `allowed-tools` optional)
- Locations — all supported as equivalents:
  - Personal: `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`
  - Project: `.github/skills/`, `.claude/skills/`, `.agents/skills/`
- Extra dirs via `COPILOT_SKILLS_DIRS`

**Copilot CLI reads Claude Code's directory conventions directly** (`CLAUDE.md`, `~/.claude/skills/`). A user running both tools shares authoring context automatically.

## Worktree handling

- Supports working inside a git worktree
- **No managed `~/.copilot/worktrees/` tree** analogous to Claude Code's `~/.claude/worktrees/`. Worktrees are ordinary user-created git worktrees.
- `/fleet` subagents run in parallel but docs don't describe subagent storage. Community posts (e.g., [discussion #179403](https://github.com/orgs/community/discussions/179403)) show users combining worktrees + `/fleet` manually.

## Comparison: Copilot CLI vs Claude Code

| Dimension | Copilot CLI | Claude Code |
|---|---|---|
| Session storage | `~/.copilot/session-state/` + `~/.copilot/session-store.db` | `~/.claude/projects/<encoded-path>/` JSONL |
| Format | JSONL + SQLite index | JSONL |
| Schema published? | No | Yes — stable field set |
| Hooks | `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred` | `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Notification`, `SubagentStop` |
| Hook config location | `.github/hooks/*.json` (repo-level only) | `~/.claude/settings.json` (user), `.claude/settings.json` (repo), `.claude/settings.local.json` |
| Hook payload | JSON on stdin: `timestamp`, `cwd`, event fields | JSON on stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, tool payloads |
| Deny contract | `{permissionDecision: "deny"}` | `{permissionDecision: "deny"}` or exit code 2 |
| Tool uses recorded | Yes, schema not published | Yes with full schema |
| Token counts per turn | Not documented as persisted | Yes: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| Model per turn recorded | Not documented | Yes: `message.model` |
| Billing unit | Premium requests (1× per prompt, model-agnostic) | Actual Anthropic API tokens priced per model |
| Resume | `/resume`, `--resume=ID`, `--continue` | `--resume`, `-r`, `--continue`, `-c` |
| User instructions | `~/.copilot/copilot-instructions.md` + reads `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | `~/.claude/CLAUDE.md` + project `CLAUDE.md` |
| Skills | `SKILL.md` in `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`, `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.claude/skills/` |
| Worktrees | No managed tree | `~/.claude/worktrees/` managed tree |
| Export | `/share file`, `/share gist`, `--share=PATH`, `--share-gist` (Markdown) | No built-in Markdown export |
| Source open? | No | No |

## Gaps requiring empirical verification

Not answered by any public GitHub doc — needs running the tool and inspecting output:

1. Exact JSONL record schema under `~/.copilot/session-state/` — fields, nesting, per-turn vs per-event, tool-call encoding
2. SQLite schema of `~/.copilot/session-store.db` — tables, columns, whether tokens/costs/models are denormalized there, how it joins the JSONL files
3. Directory layout inside `session-state/` — one subdir per session, flat `{id}.jsonl`, per-day, per-repo? Chronicle doc says "a set of files … per session" (plural) without enumerating
4. **Whether per-turn token counts exist on disk anywhere** — critical for AX cost metrics
5. **Whether model/provider is recorded per turn** in the JSONL, or only the active model
6. Timestamps — per-turn? format (ms vs ISO)?
7. `config.json` schema — valid keys, defaults
8. Subagent / `/fleet` storage — per-subagent session file? parent/child relationships?
9. **User-level hooks?** Docs only describe `.github/hooks/`; empirical check of `~/.copilot/hooks/` or a `config.json` hooks key would be valuable. If unsupported, AX can't install one global `sessionEnd` hook
10. Does the `sessionEnd` hook payload include a `transcriptPath` field (analog to Claude's `transcript_path`)? The command reference mentions `transcriptPath` as a hook field — if confirmed for `sessionEnd` specifically, it's the AX-friendly entry point

## Implications for AX

- **Ingestion path:** register `sessionEnd` hook per repo (no global option), read `transcriptPath`, parse JSONL, push to AX. Per-repo install is a UX regression from Claude Code's single-`ax init` flow.
- **Token metrics at risk.** ADR-009 relies on real token counts. Copilot docs suggest only "premium request" counts are exposed. Until confirmed empirically, treat dollar-cost metrics for Copilot sessions as out-of-scope or build a parallel "premium requests" metric.
- **Cross-tool context sharing is a nice side-effect.** Copilot CLI natively reads `CLAUDE.md` and `~/.claude/skills/` — AX docs/onboarding can highlight this.

## Source URLs

- [Copilot CLI landing page](https://github.com/features/copilot/cli)
- [@github/copilot on npm](https://www.npmjs.com/package/@github/copilot)
- [github/copilot-cli repo](https://github.com/github/copilot-cli) (docs only)
- [GA changelog Feb 25, 2026](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)
- [about-copilot-cli](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)
- [CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference)
- [Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [Using hooks with Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- [Chronicle doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle)
- [Add custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)
- [Create custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [Add skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
- [Fleet doc](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/fleet)
