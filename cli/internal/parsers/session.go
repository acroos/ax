package parsers

// session.go — shared types for the push pipeline.
//
// Import-cycle note: this file must NOT import the agents package.
// The agents package imports parsers (for *ParsedSession), and parsers
// must not import agents in return. ToSessionData receives capability
// information via the Caps argument, constructed by callers from
// agents.Registry()[id].Capabilities.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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

// ParsedSession contains aggregated data from a coding-agent session.
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
	PrimaryModel             string // model used in majority of messages
	AgentType                string // claude_code or copilot_cli

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

	// Context and tool categorization metrics
	PeakContextTokens int // max (input + cache_creation + cache_read) across any single message
	TotalToolCalls    int // sum of all tool call counts
	AgentToolCalls    int // ToolCalls["Agent"]
	SkillToolCalls    int // ToolCalls["Skill"]
	McpToolCalls      int // sum of ToolCalls entries with "mcp__" prefix

	// Agent-specific enrichment. Populated by agent providers that have additional
	// data sources (e.g. Cursor's ai-tracking DB). Passed through as the extras
	// JSONB column on the server. Claude and Copilot leave this nil.
	Extras map[string]any
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

// ParseTimestamp converts an ISO 8601 timestamp string to unix milliseconds.
// Exported so agent sub-packages can reuse it without re-declaring locally.
func ParseTimestamp(ts string) int64 {
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

// Caps carries the capability flags needed by ToSessionData.
// Mirrors the shape of agents.Capabilities.Fields; callers populate it
// from agents.Registry()[id].Capabilities without a direct import.
type Caps struct {
	SidechainMessages bool
	PeakContextPct    bool
	InputTokens       bool
	OutputTokens      bool
	CacheCreation     bool
	CacheRead         bool
}

// ToSessionData converts a ParsedSession to the API push payload format.
// caps describes which optional fields the agent supports. Callers construct
// caps from agents.Registry()[agents.AgentID(s.AgentType)].Capabilities.Fields.
func (s *ParsedSession) ToSessionData(caps Caps) api.SessionData {
	agentType := s.AgentType
	if agentType == "" {
		agentType = "claude_code"
	}

	var peakContextPct *float64
	if caps.PeakContextPct && s.PeakContextTokens > 0 {
		maxCtx := pricing.LookupMaxContext(s.PrimaryModel)
		value := float64(s.PeakContextTokens) / float64(maxCtx)
		peakContextPct = &value
	}

	var sidechainMessages *int
	if caps.SidechainMessages {
		value := s.SidechainMessages
		sidechainMessages = &value
	}

	var inputTokens *int
	if caps.InputTokens {
		v := s.InputTokens
		inputTokens = &v
	}
	var outputTokens *int
	if caps.OutputTokens {
		v := s.OutputTokens
		outputTokens = &v
	}
	var cacheCreation *int
	if caps.CacheCreation {
		v := s.CacheCreationInputTokens
		cacheCreation = &v
	}
	var cacheRead *int
	if caps.CacheRead {
		v := s.CacheReadInputTokens
		cacheRead = &v
	}

	out := api.SessionData{
		ID:                       s.ID,
		AgentType:                agentType,
		Branch:                   s.Branch,
		StartedAt:                s.StartedAt,
		EndedAt:                  s.EndedAt,
		MessageCount:             s.HumanMessages,
		TurnCount:                s.TurnCount,
		InputTokens:              inputTokens,
		OutputTokens:             outputTokens,
		CacheCreationInputTokens: cacheCreation,
		CacheReadInputTokens:     cacheRead,
		PrimaryModel:             s.PrimaryModel,
		FilesReadCount:           len(s.FilesRead),
		FilesModifiedCount:       len(s.FilesModified),
		AssistantMessageCount:    s.AssistantMessages,
		SidechainMessages:        sidechainMessages,
		TotalFileReads:           s.TotalFileReads,
		PeakContextPct:           peakContextPct,
		TotalToolCalls:           s.TotalToolCalls,
		AgentToolCalls:           s.AgentToolCalls,
		SkillToolCalls:           s.SkillToolCalls,
		McpToolCalls:             s.McpToolCalls,
	}
	if len(s.Extras) > 0 {
		out.Extras = s.Extras
	}
	return out
}

// CapsFromFields constructs a Caps from a raw fields map (agents.Capabilities.Fields).
// Defined here to avoid callers needing to remember field key strings.
func CapsFromFields(fields map[string]bool) Caps {
	return Caps{
		SidechainMessages: fields["sidechain_messages"],
		PeakContextPct:    fields["peak_context_pct"],
		InputTokens:       fields["input_tokens"],
		OutputTokens:      fields["output_tokens"],
		CacheCreation:     fields["cache_creation_input_tokens"],
		CacheRead:         fields["cache_read_input_tokens"],
	}
}
