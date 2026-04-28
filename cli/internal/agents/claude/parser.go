package claude

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/agents"
	"github.com/austinroos/ax/internal/parsers"
)

// ParseSession reads session data from a JSONL file or a session directory and
// extracts aggregated data. When path is a directory, all subagent JSONL files
// within it are parsed and merged into a single session.
func parseSession(path string) (*parsers.ParsedSession, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat session path: %w", err)
	}

	var sessionID string
	var files []string

	if info.IsDir() {
		sessionID = filepath.Base(path)
		files, err = filepath.Glob(filepath.Join(path, "subagents", "*.jsonl"))
		if err != nil || len(files) == 0 {
			return nil, fmt.Errorf("no session data files in %s", path)
		}
	} else {
		sessionID = strings.TrimSuffix(filepath.Base(path), ".jsonl")
		files = []string{path}
	}

	return parseSessionFiles(sessionID, files)
}

// parseSessionFiles parses one or more JSONL files and merges them into a
// single ParsedSession.
func parseSessionFiles(sessionID string, files []string) (*parsers.ParsedSession, error) {
	session := &parsers.ParsedSession{
		ID:        sessionID,
		AgentType: string(agents.ClaudeCode),
		ToolCalls: make(map[string]int),
	}

	modelCounts := make(map[string]int)
	seenMessageIDs := make(map[string]bool)
	filesReadSet := make(map[string]bool)
	filesModifiedSet := make(map[string]bool)
	seenPRURLs := make(map[string]bool)
	seenCommitSHAs := make(map[string]bool)

	bashToolIDs := make(map[string]string) // tool_use_id → command

	var lastWasHuman bool
	var lastErr error

	for _, filePath := range files {
		err := parseSessionFile(filePath, session, modelCounts, seenMessageIDs,
			filesReadSet, filesModifiedSet, seenPRURLs, seenCommitSHAs,
			bashToolIDs, &lastWasHuman)
		if err != nil {
			lastErr = err
		}
	}

	// Determine primary model
	maxCount := 0
	for model, count := range modelCounts {
		if count > maxCount {
			maxCount = count
			session.PrimaryModel = model
		}
	}

	// Derive tool call categorization counts
	for name, count := range session.ToolCalls {
		session.TotalToolCalls += count
		switch {
		case name == "Agent":
			session.AgentToolCalls += count
		case name == "Skill":
			session.SkillToolCalls += count
		case strings.HasPrefix(name, "mcp__"):
			session.McpToolCalls += count
		}
	}

	// Convert sets to slices
	for f := range filesReadSet {
		session.FilesRead = append(session.FilesRead, f)
	}
	for f := range filesModifiedSet {
		session.FilesModified = append(session.FilesModified, f)
	}
	for url := range seenPRURLs {
		session.PRURLs = append(session.PRURLs, url)
	}
	for sha := range seenCommitSHAs {
		session.CommitSHAs = append(session.CommitSHAs, sha)
	}

	return session, lastErr
}

// parseSessionFile reads a single JSONL file and accumulates data into the
// provided session and tracking maps.
func parseSessionFile(filePath string, session *parsers.ParsedSession,
	modelCounts map[string]int, seenMessageIDs map[string]bool,
	filesReadSet, filesModifiedSet, seenPRURLs, seenCommitSHAs map[string]bool,
	bashToolIDs map[string]string, lastWasHuman *bool) error {

	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open session file: %w", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		var msg sessionMessage
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			continue
		}

		// Track branch
		if msg.GitBranch != "" {
			session.Branch = msg.GitBranch
		}

		// Track timestamps
		ts := parsers.ParseTimestamp(msg.Timestamp)
		if ts > 0 {
			if session.StartedAt == 0 || ts < session.StartedAt {
				session.StartedAt = ts
			}
			if ts > session.EndedAt {
				session.EndedAt = ts
			}
		}

		if msg.IsSidechain {
			session.SidechainMessages++
		}

		switch msg.Type {
		case "user":
			if msg.IsMeta {
				continue
			}
			var mc messageContent
			if err := json.Unmarshal(msg.Message, &mc); err != nil {
				continue
			}

			contentStr := string(mc.Content)
			if isHumanMessage(contentStr) {
				session.HumanMessages++
				if !*lastWasHuman {
					*lastWasHuman = true
				}
			}

			parseToolResults(mc.Content, bashToolIDs, session, seenPRURLs, seenCommitSHAs)

		case "assistant":
			var mc messageContent
			if err := json.Unmarshal(msg.Message, &mc); err != nil {
				continue
			}

			// Deduplicate by message ID
			if mc.ID != "" {
				if seenMessageIDs[mc.ID] {
					continue
				}
				seenMessageIDs[mc.ID] = true
			}

			session.AssistantMessages++

			// Count turns (human followed by assistant)
			if *lastWasHuman {
				session.TurnCount++
				*lastWasHuman = false
			}

			// Token usage
			if mc.Usage != nil {
				session.InputTokens += mc.Usage.InputTokens
				session.OutputTokens += mc.Usage.OutputTokens
				session.CacheCreationInputTokens += mc.Usage.CacheCreationInputTokens
				session.CacheReadInputTokens += mc.Usage.CacheReadInputTokens

				msgContext := mc.Usage.InputTokens + mc.Usage.CacheCreationInputTokens + mc.Usage.CacheReadInputTokens
				if msgContext > session.PeakContextTokens {
					session.PeakContextTokens = msgContext
				}

				if mc.Model != "" {
					modelCounts[mc.Model]++
				}
			}

			parseToolUseBlocks(mc.Content, session, bashToolIDs, filesReadSet, filesModifiedSet)
		}
	}

	return scanner.Err()
}

// isHumanMessage determines if a content string represents a real human message
// (not a command, meta message, or tool result).
func isHumanMessage(content string) bool {
	if strings.HasPrefix(content, "<command-name>") {
		return false
	}
	if strings.HasPrefix(content, "<local-command") {
		return false
	}
	if strings.HasPrefix(content, "[") {
		return false
	}
	if content == "" {
		return false
	}
	return true
}

// parseToolUseBlocks extracts tool usage data from assistant message content.
func parseToolUseBlocks(content json.RawMessage, session *parsers.ParsedSession,
	bashToolIDs map[string]string, filesReadSet, filesModifiedSet map[string]bool) {

	var blocks []toolUseBlock
	if err := json.Unmarshal(content, &blocks); err != nil {
		return
	}

	for _, block := range blocks {
		if block.Type != "tool_use" {
			continue
		}
		session.ToolCalls[block.Name]++

		switch block.Name {
		case "Bash":
			var inp bashInput
			if json.Unmarshal(block.Input, &inp) == nil && inp.Command != "" {
				bashToolIDs[block.ID] = inp.Command
			}
		case "Read":
			var inp readInput
			if json.Unmarshal(block.Input, &inp) == nil && inp.FilePath != "" {
				filesReadSet[inp.FilePath] = true
				session.TotalFileReads++
			}
		case "Glob":
			// Glob reads files but we don't track individual results
		case "Edit":
			var inp editInput
			if json.Unmarshal(block.Input, &inp) == nil && inp.FilePath != "" {
				filesModifiedSet[inp.FilePath] = true
			}
		case "Write":
			var inp writeInput
			if json.Unmarshal(block.Input, &inp) == nil && inp.FilePath != "" {
				filesModifiedSet[inp.FilePath] = true
			}
		}
	}
}

// parseToolResults processes tool result content to extract signals.
func parseToolResults(content json.RawMessage, bashToolIDs map[string]string,
	session *parsers.ParsedSession, seenPRURLs, seenCommitSHAs map[string]bool) {

	var blocks []toolResultBlock
	if err := json.Unmarshal(content, &blocks); err != nil {
		return
	}

	for _, block := range blocks {
		if block.Type != "tool_result" {
			continue
		}

		cmd, isBash := bashToolIDs[block.ToolUseID]
		if isBash {
			if strings.Contains(cmd, "gh pr create") {
				extractPRURLs(block.Content, seenPRURLs)
			}
			if strings.Contains(cmd, "git commit") {
				extractCommitSHAs(block.Content, seenCommitSHAs)
			}
		}
	}
}

// extractPRURLs finds GitHub PR URLs in text.
func extractPRURLs(text string, seen map[string]bool) {
	for _, word := range strings.Fields(text) {
		if strings.Contains(word, "github.com/") && strings.Contains(word, "/pull/") {
			url := word
			if idx := strings.Index(url, "https://"); idx >= 0 {
				url = url[idx:]
			}
			seen[url] = true
		}
	}
}

// extractCommitSHAs finds git commit SHAs in git commit output.
// Git commit output looks like: "[main abc1234] commit message"
func extractCommitSHAs(text string, seen map[string]bool) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "[") {
			if idx := strings.Index(line, "]"); idx > 0 {
				inner := line[1:idx]
				parts := strings.Fields(inner)
				if len(parts) >= 2 {
					sha := parts[len(parts)-1]
					if len(sha) >= 7 {
						seen[sha] = true
					}
				}
			}
		}
	}
}
