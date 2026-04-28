// Package api defines the data types for the AX server API.
package api

// PushPayload is the data sent from a developer's CLI to the AX server.
type PushPayload struct {
	PayloadVersion int           `json:"payload_version"`
	RepoPath       string        `json:"repo_path,omitempty"`
	RemoteURL      string        `json:"remote_url,omitempty"`
	Owner          string        `json:"owner"`
	Repo           string        `json:"repo"`
	Sessions       []SessionData `json:"sessions"`
}

// PushResponse is returned by the server after processing a push.
type PushResponse struct {
	OK       bool           `json:"ok"`
	Entities map[string]int `json:"entities"`
	Error    string         `json:"error,omitempty"`
}

// SessionData represents an agentic coding session in the push payload.
type SessionData struct {
	ID                       string   `json:"id"`
	AgentType                string   `json:"agent_type,omitempty"`
	Branch                   string   `json:"branch,omitempty"`
	StartedAt                int64    `json:"started_at,omitempty"`
	EndedAt                  int64    `json:"ended_at,omitempty"`
	MessageCount             int      `json:"message_count"`
	TurnCount                int      `json:"turn_count"`
	InputTokens              *int     `json:"input_tokens,omitempty"`
	OutputTokens             *int     `json:"output_tokens,omitempty"`
	CacheCreationInputTokens *int     `json:"cache_creation_input_tokens,omitempty"`
	CacheReadInputTokens     *int     `json:"cache_read_input_tokens,omitempty"`
	PrimaryModel             string   `json:"primary_model,omitempty"`
	FilesReadCount           int      `json:"files_read_count"`
	FilesModifiedCount       int      `json:"files_modified_count"`
	AssistantMessageCount    int      `json:"assistant_message_count"`
	SidechainMessages        *int     `json:"sidechain_messages,omitempty"`
	TotalFileReads           int      `json:"total_file_reads"`
	PeakContextPct           *float64 `json:"peak_context_pct,omitempty"`
	TotalToolCalls           int            `json:"total_tool_calls"`
	AgentToolCalls           int            `json:"agent_tool_calls"`
	SkillToolCalls           int            `json:"skill_tool_calls"`
	McpToolCalls             int            `json:"mcp_tool_calls"`
	Extras                   map[string]any `json:"extras,omitempty"`
}
