// Package pushcommand generates the bash one-liner used by AX hook installers
// to push session data on agent session end.
package pushcommand

import (
	"fmt"
	"strings"
)

// Spec parameterizes the generated bash command.
type Spec struct {
	AxBinary string // absolute path or name of the ax binary (e.g. "/usr/local/bin/ax")
	LogPath  string // path for the push log; defaults to "$HOME/.ax/push.log"
	// WorktreeMarker is a path fragment used to detect Claude Code worktrees
	// (e.g. "/.claude/worktrees/"). When empty, worktree fallback is omitted
	// and the generated command stays simple — suitable for agents like Copilot
	// that do not use worktrees. When non-empty, the marker's dots are escaped
	// for use as a sed basic-regex pattern.
	WorktreeMarker string
}

// Build returns the bash one-liner that runs `ax push --repo` for the repo
// found in the agent's hook input. It handles timestamped logging and,
// when WorktreeMarker is set, resolves the repo from a worktree path.
func Build(s Spec) string {
	log := s.LogPath
	if log == "" {
		log = `$HOME/.ax/push.log`
	}

	if s.WorktreeMarker != "" {
		// Escape dots for sed basic-regex (e.g. "/.claude/worktrees/" → "\/\.claude\/worktrees\/").
		// Only dots need escaping inside the sed character set used here.
		sedMarker := strings.ReplaceAll(s.WorktreeMarker, ".", `\.`)
		return fmt.Sprintf(
			`bash -c 'LOG="%s"; mkdir -p "$(dirname "$LOG")"; TS() { date +%%Y-%%m-%%dT%%H:%%M:%%S; }; INPUT=$(cat); CWD=$(echo "$INPUT" | grep -o "\"cwd\": *\"[^\"]*\"" | cut -d\" -f4); if [ -z "$CWD" ]; then echo "[$(TS)] skip: no cwd in hook input" >> "$LOG"; exit 0; fi; PUSH_REPO=""; if [ -e "$CWD/.git" ]; then PUSH_REPO="$CWD"; else REPO=$(echo "$CWD" | sed -n "s|%s.*||p"); if [ -n "$REPO" ] && [ -d "$REPO/.git" ]; then PUSH_REPO="$REPO"; fi; fi; if [ -z "$PUSH_REPO" ]; then echo "[$(TS)] skip: no git repo at $CWD" >> "$LOG"; exit 0; fi; OUTPUT=$(%s push --repo "$PUSH_REPO" 2>&1); RC=$?; if [ -n "$OUTPUT" ]; then echo "$OUTPUT" | while IFS= read -r line; do [ -n "$line" ] && echo "[$(TS)] $line" >> "$LOG"; done; fi; if [ $RC -eq 0 ]; then echo "[$(TS)] ok: push completed for $PUSH_REPO" >> "$LOG"; else echo "[$(TS)] error: push failed for $PUSH_REPO (exit $RC)" >> "$LOG"; fi'`,
			log, sedMarker, s.AxBinary,
		)
	}

	return fmt.Sprintf(
		`bash -c 'LOG="%s"; mkdir -p "$(dirname "$LOG")"; TS() { date +%%Y-%%m-%%dT%%H:%%M:%%S; }; INPUT=$(cat); CWD=$(echo "$INPUT" | grep -o "\"cwd\": *\"[^\"]*\"" | cut -d\" -f4); if [ -z "$CWD" ]; then echo "[$(TS)] skip: no cwd in hook input" >> "$LOG"; exit 0; fi; PUSH_REPO=""; if [ -e "$CWD/.git" ]; then PUSH_REPO="$CWD"; fi; if [ -z "$PUSH_REPO" ]; then echo "[$(TS)] skip: no git repo at $CWD" >> "$LOG"; exit 0; fi; OUTPUT=$(%s push --repo "$PUSH_REPO" 2>&1); RC=$?; if [ -n "$OUTPUT" ]; then echo "$OUTPUT" | while IFS= read -r line; do [ -n "$line" ] && echo "[$(TS)] $line" >> "$LOG"; done; fi; if [ $RC -eq 0 ]; then echo "[$(TS)] ok: push completed for $PUSH_REPO" >> "$LOG"; else echo "[$(TS)] error: push failed for $PUSH_REPO (exit $RC)" >> "$LOG"; fi'`,
		log, s.AxBinary,
	)
}
