package claude

import "encoding/json"

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
	ToolResultUUID string       `json:"toolResultUuid"`
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
