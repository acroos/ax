package parsers

// session.go — shared types for the push pipeline.
//
// Import-cycle note: this file must NOT import the agents package.
// The agents package imports parsers (for *ParsedSession), and parsers
// must not import agents in return. ToSessionData receives capability
// information via the Caps argument, constructed by callers from
// agents.Registry()[id].Capabilities.

import (
	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/pricing"
)

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

	return api.SessionData{
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

// DefaultCaps returns capability flags based on the session's AgentType string,
// matching the declarations in agents.yaml without requiring an agents import.
// Callers can use this when they don't have access to agents.Registry().
func DefaultCaps(agentType string) Caps {
	return defaultCaps(agentType)
}

// defaultCaps is the unexported implementation.
func defaultCaps(agentType string) Caps {
	switch agentType {
	case "copilot_cli":
		return Caps{
			SidechainMessages: false,
			PeakContextPct:    false,
			InputTokens:       true,
			OutputTokens:      true,
			CacheCreation:     true,
			CacheRead:         true,
		}
	default: // claude_code and any unknown agent
		return Caps{
			SidechainMessages: true,
			PeakContextPct:    true,
			InputTokens:       true,
			OutputTokens:      true,
			CacheCreation:     true,
			CacheRead:         true,
		}
	}
}
