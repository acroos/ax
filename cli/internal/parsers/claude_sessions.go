package parsers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/pricing"
)

// HistoryEntry represents a single line in ~/.claude/history.jsonl.
type HistoryEntry struct {
	Display   string `json:"display"`
	Timestamp int64  `json:"timestamp"`
	Project   string `json:"project"`
	SessionID string `json:"sessionId"`
}

// ParsedSession contains aggregated data from a Claude Code session JSONL file.
type ParsedSession struct {
	ID        string
	Project   string // filesystem path to the project
	Branch    string // git branch (last seen)
	StartedAt int64  // earliest timestamp (unix ms)
	EndedAt   int64  // latest timestamp (unix ms)

	// Message counts
	HumanMessages     int // non-meta, non-command user messages
	AssistantMessages int
	TurnCount         int // human→assistant turn pairs

	// Token usage (summed across all assistant messages)
	InputTokens              int
	OutputTokens             int
	CacheCreationInputTokens int
	CacheReadInputTokens     int
	TotalCostUSD             float64
	PrimaryModel             string // model used in majority of messages

	// Tool usage
	ToolCalls     map[string]int // tool name → call count
	FilesRead     []string       // unique files from Read/Glob tool calls
	FilesModified []string       // unique files from Edit/Write tool calls

	// Extracted signals
	PRURLs     []string // PR URLs found in gh pr create output
	CommitSHAs []string // commit SHAs from git commit output

	// New metrics
	SidechainMessages int // messages on sidechain branches
	TotalFileReads    int // total Read tool calls (including re-reads)
}

// ToSessionData converts a ParsedSession to the API push payload format.
func (s *ParsedSession) ToSessionData() api.SessionData {
	return api.SessionData{
		ID:                       s.ID,
		Branch:                   s.Branch,
		StartedAt:                s.StartedAt,
		EndedAt:                  s.EndedAt,
		MessageCount:             s.HumanMessages,
		TurnCount:                s.TurnCount,
		InputTokens:              s.InputTokens,
		OutputTokens:             s.OutputTokens,
		CacheCreationInputTokens: s.CacheCreationInputTokens,
		CacheReadInputTokens:     s.CacheReadInputTokens,
		TotalCostUSD:             s.TotalCostUSD,
		PrimaryModel:             s.PrimaryModel,
		FilesReadCount:           len(s.FilesRead),
		FilesModifiedCount:       len(s.FilesModified),
		AssistantMessageCount:    s.AssistantMessages,
		SidechainMessages:        s.SidechainMessages,
		TotalFileReads:           s.TotalFileReads,
	}
}

// sessionMessage represents a single line in a session JSONL file.
type sessionMessage struct {
	Type        string          `json:"type"`
	UUID        string          `json:"uuid"`
	ParentUUID  *string         `json:"parentUuid"`
	SessionID   string          `json:"sessionId"`
	GitBranch   string          `json:"gitBranch"`
	Timestamp   string          `json:"timestamp"`
	IsMeta      bool            `json:"isMeta"`
	IsSidechain bool            `json:"isSidechain"`
	Message     json.RawMessage `json:"message"`
	// For tool_result type messages
	ToolResultUUID string `json:"toolResultUuid"`
}

// messageContent represents the message field for user/assistant messages.
type messageContent struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
	Model   string          `json:"model"`
	Usage   *tokenUsage     `json:"usage"`
	ID      string          `json:"id"`
}

type tokenUsage struct {
	InputTokens              int `json:"input_tokens"`
	OutputTokens             int `json:"output_tokens"`
	CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
	CacheReadInputTokens     int `json:"cache_read_input_tokens"`
}

// toolUseBlock represents a tool_use block in assistant message content.
type toolUseBlock struct {
	Type  string          `json:"type"`
	ID    string          `json:"id"`
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

// toolResultBlock represents a tool_result in a user/system message content.
type toolResultBlock struct {
	Type      string `json:"type"`
	ToolUseID string `json:"tool_use_id"`
	Content   string `json:"content"`
	IsError   bool   `json:"is_error"`
}

// bashInput represents the input to a Bash tool call.
type bashInput struct {
	Command string `json:"command"`
}

// readInput represents the input to a Read tool call.
type readInput struct {
	FilePath string `json:"file_path"`
}

// editInput represents the input to an Edit tool call.
type editInput struct {
	FilePath string `json:"file_path"`
}

// writeInput represents the input to a Write tool call.
type writeInput struct {
	FilePath string `json:"file_path"`
}

// LoadHistory reads ~/.claude/history.jsonl and returns entries grouped by session.
func LoadHistory(claudeDir string) (map[string][]HistoryEntry, error) {
	historyPath := filepath.Join(claudeDir, "history.jsonl")
	f, err := os.Open(historyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open history.jsonl: %w", err)
	}
	defer f.Close()

	sessions := make(map[string][]HistoryEntry)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB buffer
	for scanner.Scan() {
		var entry HistoryEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			continue
		}
		if entry.SessionID != "" {
			sessions[entry.SessionID] = append(sessions[entry.SessionID], entry)
		}
	}
	return sessions, scanner.Err()
}

// FindSessionFiles returns all session JSONL files for a given project path.
// It also discovers sessions from Claude Code worktrees belonging to the same repo
// (stored under <repo>/.claude/worktrees/<name>/).
func FindSessionFiles(claudeDir, projectPath string) ([]string, error) {
	// Claude Code stores project sessions in ~/.claude/projects/<encoded-path>/
	// Claude Code replaces both "/" and "." with "-" when encoding paths.
	encodedPath := strings.ReplaceAll(strings.ReplaceAll(projectPath, "/", "-"), ".", "-")
	projectDir := filepath.Join(claudeDir, "projects", encodedPath)

	var allMatches []string

	if _, err := os.Stat(projectDir); err == nil {
		matches, err := filepath.Glob(filepath.Join(projectDir, "*.jsonl"))
		if err != nil {
			return nil, fmt.Errorf("failed to glob session files: %w", err)
		}
		allMatches = append(allMatches, matches...)
	}

	// Also find sessions from Claude Code worktrees for this repo.
	// Worktrees are created at <repo>/.claude/worktrees/<name>/, and their
	// sessions are stored under a separate encoded path. We glob for any
	// project directory that matches the worktree naming pattern.
	worktreePattern := filepath.Join(claudeDir, "projects", encodedPath+"--claude-worktrees-*")
	worktreeDirs, err := filepath.Glob(worktreePattern)
	if err != nil {
		return nil, fmt.Errorf("failed to glob worktree directories: %w", err)
	}
	for _, wtDir := range worktreeDirs {
		matches, err := filepath.Glob(filepath.Join(wtDir, "*.jsonl"))
		if err != nil {
			return nil, fmt.Errorf("failed to glob worktree session files: %w", err)
		}
		allMatches = append(allMatches, matches...)
	}

	return allMatches, nil
}

// ParseSession reads a session JSONL file and extracts aggregated data.
func ParseSession(filePath string) (*ParsedSession, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open session file: %w", err)
	}
	defer f.Close()

	// Session ID is the filename without extension
	sessionID := strings.TrimSuffix(filepath.Base(filePath), ".jsonl")

	session := &ParsedSession{
		ID:        sessionID,
		ToolCalls: make(map[string]int),
	}

	modelCounts := make(map[string]int)     // track model usage frequency
	seenMessageIDs := make(map[string]bool) // deduplicate by message ID
	filesReadSet := make(map[string]bool)
	filesModifiedSet := make(map[string]bool)
	seenPRURLs := make(map[string]bool)
	seenCommitSHAs := make(map[string]bool)

	// Track tool call IDs to match with results
	bashToolIDs := make(map[string]string) // tool_use_id → command

	var lastWasHuman bool

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024) // 4MB buffer for large messages
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
		ts := parseTimestamp(msg.Timestamp)
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

			// Check if this is a real human message (not a command, not a tool result)
			contentStr := string(mc.Content)
			if isHumanMessage(contentStr) {
				session.HumanMessages++
				if !lastWasHuman {
					lastWasHuman = true
				}
			}

			// Check content for tool_result blocks (these come back in user messages)
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
			if lastWasHuman {
				session.TurnCount++
				lastWasHuman = false
			}

			// Token usage
			if mc.Usage != nil {
				session.InputTokens += mc.Usage.InputTokens
				session.OutputTokens += mc.Usage.OutputTokens
				session.CacheCreationInputTokens += mc.Usage.CacheCreationInputTokens
				session.CacheReadInputTokens += mc.Usage.CacheReadInputTokens

				// Compute per-message cost
				if mc.Model != "" {
					cost := pricing.ComputeCost(mc.Model, mc.Usage.InputTokens,
						mc.Usage.OutputTokens, mc.Usage.CacheReadInputTokens,
						mc.Usage.CacheCreationInputTokens)
					session.TotalCostUSD += cost
					modelCounts[mc.Model]++
				}
			}

			// Parse tool_use blocks from content
			parseToolUseBlocks(mc.Content, session, bashToolIDs, filesReadSet, filesModifiedSet)
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

	return session, scanner.Err()
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
		// Might be a JSON array (tool results)
		return false
	}
	if content == "" {
		return false
	}
	return true
}

// parseToolUseBlocks extracts tool usage data from assistant message content.
func parseToolUseBlocks(content json.RawMessage, session *ParsedSession,
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
			// We count it as a read operation
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
	session *ParsedSession, seenPRURLs, seenCommitSHAs map[string]bool) {

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
			// Check for PR URL in gh pr create output
			if strings.Contains(cmd, "gh pr create") {
				extractPRURLs(block.Content, seenPRURLs)
			}

			// Check for commit SHA in git commit output
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
			// Clean up the URL
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
			// Parse "[branch sha] message"
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

// parseTimestamp converts an ISO 8601 timestamp string to unix milliseconds.
func parseTimestamp(ts string) int64 {
	if ts == "" {
		return 0
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		t, err = time.Parse(time.RFC3339, ts)
		if err != nil {
			return 0
		}
	}
	return t.UnixMilli()
}
