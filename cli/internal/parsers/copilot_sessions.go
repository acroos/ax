package parsers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type copilotEvent struct {
	Type      string          `json:"type"`
	Data      json.RawMessage `json:"data"`
	Timestamp string          `json:"timestamp"`
}

type copilotSessionStartData struct {
	SessionID string `json:"sessionId"`
	StartTime string `json:"startTime"`
	Context   struct {
		Cwd        string `json:"cwd"`
		GitRoot    string `json:"gitRoot"`
		Branch     string `json:"branch"`
		Repository string `json:"repository"`
	} `json:"context"`
}

type copilotModelChangeData struct {
	NewModel string `json:"newModel"`
}

type copilotAssistantMessageData struct {
	MessageID    string `json:"messageId"`
	OutputTokens int    `json:"outputTokens"`
	ToolRequests []struct {
		ToolCallID string          `json:"toolCallId"`
		ToolID     string          `json:"id"`
		Name       string          `json:"name"`
		ToolName   string          `json:"toolName"`
		Arguments  json.RawMessage `json:"arguments"`
	} `json:"toolRequests"`
}

type copilotToolExecutionStartData struct {
	ToolCallID string          `json:"toolCallId"`
	ToolID     string          `json:"toolRequestId"`
	ToolName   string          `json:"toolName"`
	Arguments  json.RawMessage `json:"arguments"`
}

type copilotToolExecutionCompleteData struct {
	ToolCallID string `json:"toolCallId"`
	ToolID     string `json:"toolRequestId"`
	Model      string `json:"model"`
	Result     struct {
		Content         string `json:"content"`
		DetailedContent string `json:"detailedContent"`
	} `json:"result"`
}

type copilotShutdownData struct {
	CurrentModel  string          `json:"currentModel"`
	CurrentTokens int             `json:"currentTokens"`
	ModelMetrics  json.RawMessage `json:"modelMetrics"`
}

type copilotModelMetric struct {
	Model    string `json:"model"`
	Requests struct {
		Count int `json:"count"`
	} `json:"requests"`
	Usage struct {
		InputTokens      int `json:"inputTokens"`
		OutputTokens     int `json:"outputTokens"`
		CacheReadTokens  int `json:"cacheReadTokens"`
		CacheWriteTokens int `json:"cacheWriteTokens"`
		ReasoningTokens  int `json:"reasoningTokens"`
	} `json:"usage"`
}

type copilotPathArg struct {
	Path     string `json:"path"`
	FilePath string `json:"file_path"`
}

type copilotBashArg struct {
	Command string `json:"command"`
}

// ParseCopilotSession parses a Copilot CLI session-state/<uuid> directory.
func ParseCopilotSession(sessionDir string) (*ParsedSession, error) {
	workspace, _ := ParseCopilotWorkspace(filepath.Join(sessionDir, "workspace.yaml"))

	session := &ParsedSession{
		ID:        CopilotSessionIDFromPath(sessionDir),
		Project:   workspace.GitRoot,
		Branch:    workspace.Branch,
		AgentType: "copilot_cli",
		ToolCalls: make(map[string]int),
	}
	if session.Project == "" {
		session.Project = workspace.Cwd
	}
	if session.StartedAt == 0 {
		session.StartedAt = parseTimestamp(workspace.CreatedAt)
	}
	if session.EndedAt == 0 {
		session.EndedAt = parseTimestamp(workspace.UpdatedAt)
	}

	eventsPath := filepath.Join(sessionDir, "events.jsonl")
	f, err := os.Open(eventsPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open Copilot events: %w", err)
	}
	defer f.Close()

	modelCounts := make(map[string]int)
	seenMessages := make(map[string]bool)
	filesReadSet := make(map[string]bool)
	filesModifiedSet := make(map[string]bool)
	seenPRURLs := make(map[string]bool)
	seenCommitSHAs := make(map[string]bool)
	bashToolIDs := make(map[string]string)
	countedToolIDs := make(map[string]bool)

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		var event copilotEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			continue
		}
		ts := parseTimestamp(event.Timestamp)
		if ts > 0 {
			if session.StartedAt == 0 || ts < session.StartedAt {
				session.StartedAt = ts
			}
			if ts > session.EndedAt {
				session.EndedAt = ts
			}
		}

		switch event.Type {
		case "session.start":
			var data copilotSessionStartData
			if json.Unmarshal(event.Data, &data) == nil {
				if data.Context.Branch != "" {
					session.Branch = data.Context.Branch
				}
				if data.Context.GitRoot != "" {
					session.Project = data.Context.GitRoot
				} else if data.Context.Cwd != "" {
					session.Project = data.Context.Cwd
				}
				if start := parseTimestamp(data.StartTime); start > 0 {
					session.StartedAt = start
				}
			}
		case "session.model_change":
			var data copilotModelChangeData
			if json.Unmarshal(event.Data, &data) == nil && data.NewModel != "" {
				modelCounts[data.NewModel]++
				session.PrimaryModel = data.NewModel
			}
		case "user.message":
			session.HumanMessages++
		case "assistant.turn_start":
			session.TurnCount++
		case "assistant.message":
			var data copilotAssistantMessageData
			if json.Unmarshal(event.Data, &data) != nil {
				continue
			}
			if data.MessageID != "" {
				if seenMessages[data.MessageID] {
					continue
				}
				seenMessages[data.MessageID] = true
			}
			session.AssistantMessages++
			session.OutputTokens += data.OutputTokens
			for _, tool := range data.ToolRequests {
				name := firstNonEmpty(tool.Name, tool.ToolName)
				toolID := firstNonEmpty(tool.ToolCallID, tool.ToolID)
				if name != "" {
					session.ToolCalls[name]++
					if toolID != "" {
						countedToolIDs[toolID] = true
					}
				}
			}
		case "tool.execution_start":
			var data copilotToolExecutionStartData
			if json.Unmarshal(event.Data, &data) == nil && data.ToolName != "" {
				toolID := firstNonEmpty(data.ToolCallID, data.ToolID)
				if toolID == "" || !countedToolIDs[toolID] {
					session.ToolCalls[data.ToolName]++
					if toolID != "" {
						countedToolIDs[toolID] = true
					}
				}
				recordCopilotTool(data.ToolName, toolID, data.Arguments, session, bashToolIDs, filesReadSet, filesModifiedSet)
			}
		case "tool.execution_complete":
			var data copilotToolExecutionCompleteData
			if json.Unmarshal(event.Data, &data) == nil {
				if data.Model != "" {
					modelCounts[data.Model]++
				}
				toolID := firstNonEmpty(data.ToolCallID, data.ToolID)
				if cmd, isBash := bashToolIDs[toolID]; isBash {
					content := data.Result.Content
					if content == "" {
						content = data.Result.DetailedContent
					}
					if strings.Contains(cmd, "gh pr create") {
						extractPRURLs(content, seenPRURLs)
					}
					if strings.Contains(cmd, "git commit") {
						extractCommitSHAs(content, seenCommitSHAs)
					}
				}
			}
		case "session.shutdown":
			var data copilotShutdownData
			if json.Unmarshal(event.Data, &data) == nil {
				if data.CurrentModel != "" {
					session.PrimaryModel = data.CurrentModel
					modelCounts[data.CurrentModel]++
				}
				session.InputTokens = 0
				session.OutputTokens = 0
				session.CacheCreationInputTokens = 0
				session.CacheReadInputTokens = 0
				for _, metrics := range parseCopilotModelMetrics(data.ModelMetrics) {
					modelCounts[metrics.Model] += metrics.Requests.Count
					session.InputTokens += metrics.Usage.InputTokens
					session.OutputTokens += metrics.Usage.OutputTokens
					session.CacheCreationInputTokens += metrics.Usage.CacheWriteTokens
					session.CacheReadInputTokens += metrics.Usage.CacheReadTokens
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	maxCount := 0
	for model, count := range modelCounts {
		if count > maxCount {
			maxCount = count
			session.PrimaryModel = model
		}
	}
	for name, count := range session.ToolCalls {
		session.TotalToolCalls += count
		switch {
		case name == "task":
			session.AgentToolCalls += count
		case strings.HasPrefix(name, "mcp__") || strings.HasPrefix(name, "mcp."):
			session.McpToolCalls += count
		}
	}
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

	return session, nil
}

func recordCopilotTool(name, toolCallID string, args json.RawMessage, session *ParsedSession, bashToolIDs map[string]string, filesReadSet, filesModifiedSet map[string]bool) {
	switch name {
	case "bash", "shell", "run_command":
		var arg copilotBashArg
		if json.Unmarshal(args, &arg) == nil && arg.Command != "" && toolCallID != "" {
			bashToolIDs[toolCallID] = arg.Command
		}
	case "view", "read_file":
		var arg copilotPathArg
		if json.Unmarshal(args, &arg) == nil {
			path := firstNonEmpty(arg.Path, arg.FilePath)
			if path == "" {
				return
			}
			filesReadSet[path] = true
			session.TotalFileReads++
		}
	case "edit", "create", "edit_file", "create_file":
		var arg copilotPathArg
		if json.Unmarshal(args, &arg) == nil {
			path := firstNonEmpty(arg.Path, arg.FilePath)
			if path == "" {
				return
			}
			filesModifiedSet[path] = true
		}
	}
}

func parseCopilotModelMetrics(raw json.RawMessage) []copilotModelMetric {
	if len(raw) == 0 {
		return nil
	}
	var byModel map[string]copilotModelMetric
	if json.Unmarshal(raw, &byModel) == nil {
		metrics := make([]copilotModelMetric, 0, len(byModel))
		for model, metric := range byModel {
			if metric.Model == "" {
				metric.Model = model
			}
			metrics = append(metrics, metric)
		}
		return metrics
	}
	var list []copilotModelMetric
	if json.Unmarshal(raw, &list) == nil {
		return list
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
