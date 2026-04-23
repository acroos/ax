// Package api defines the data types for the AX server API.
package api

// PushPayload is the data sent from a developer's CLI to the AX server.
type PushPayload struct {
	RepoPath  string        `json:"repo_path,omitempty"`
	RemoteURL string        `json:"remote_url,omitempty"`
	Owner     string        `json:"owner"`
	Repo      string        `json:"repo"`
	Sessions  []SessionData `json:"sessions"`
}

// PushResponse is returned by the server after processing a push.
type PushResponse struct {
	OK       bool           `json:"ok"`
	Entities map[string]int `json:"entities"`
	Error    string         `json:"error,omitempty"`
}

// SessionData represents a Claude Code session in the push payload.
type SessionData struct {
	ID                       string  `json:"id"`
	Branch                   string  `json:"branch,omitempty"`
	StartedAt                int64   `json:"started_at,omitempty"`
	EndedAt                  int64   `json:"ended_at,omitempty"`
	MessageCount             int     `json:"message_count"`
	TurnCount                int     `json:"turn_count"`
	InputTokens              int     `json:"input_tokens"`
	OutputTokens             int     `json:"output_tokens"`
	CacheCreationInputTokens int     `json:"cache_creation_input_tokens"`
	CacheReadInputTokens     int     `json:"cache_read_input_tokens"`
	TotalCostUSD             float64 `json:"total_cost_usd"`
	PrimaryModel             string  `json:"primary_model,omitempty"`
	FilesReadCount           int     `json:"files_read_count"`
	FilesModifiedCount       int     `json:"files_modified_count"`
	AssistantMessageCount    int     `json:"assistant_message_count"`
	SidechainMessages        int     `json:"sidechain_messages"`
	TotalFileReads           int     `json:"total_file_reads"`
	PeakContextPct           float64 `json:"peak_context_pct"`
	TotalToolCalls           int     `json:"total_tool_calls"`
	AgentToolCalls           int     `json:"agent_tool_calls"`
	SkillToolCalls           int     `json:"skill_tool_calls"`
	McpToolCalls             int     `json:"mcp_tool_calls"`
}


