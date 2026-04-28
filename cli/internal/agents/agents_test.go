package agents_test

import (
	"testing"

	"github.com/austinroos/ax/internal/agents"
	_ "github.com/austinroos/ax/internal/agentinit"
)

func TestRegisteredProvidersIncludesAllAgents(t *testing.T) {
	providers := agents.RegisteredProviders()
	ids := make(map[agents.AgentID]bool)
	for _, p := range providers {
		ids[p.ID()] = true
	}
	if !ids[agents.ClaudeCode] {
		t.Error("expected claude_code provider to be registered")
	}
	if !ids[agents.CopilotCli] {
		t.Error("expected copilot_cli provider to be registered")
	}
	if !ids[agents.CursorCli] {
		t.Error("expected cursor_cli provider to be registered")
	}
}

func TestFindProviderUnknownReturnsNil(t *testing.T) {
	p := agents.FindProvider("unknown_agent")
	if p != nil {
		t.Errorf("expected nil for unknown agent, got %v", p)
	}
}

func TestFindProviderClaude(t *testing.T) {
	p := agents.FindProvider(agents.ClaudeCode)
	if p == nil {
		t.Fatal("expected non-nil provider for claude_code")
	}
	if p.ID() != agents.ClaudeCode {
		t.Errorf("ID() = %q, want %q", p.ID(), agents.ClaudeCode)
	}
}

func TestFindProviderCopilot(t *testing.T) {
	p := agents.FindProvider(agents.CopilotCli)
	if p == nil {
		t.Fatal("expected non-nil provider for copilot_cli")
	}
	if p.ID() != agents.CopilotCli {
		t.Errorf("ID() = %q, want %q", p.ID(), agents.CopilotCli)
	}
}

func TestFindProviderCursor(t *testing.T) {
	p := agents.FindProvider(agents.CursorCli)
	if p == nil {
		t.Fatal("expected non-nil provider for cursor_cli")
	}
	if p.ID() != agents.CursorCli {
		t.Errorf("ID() = %q, want %q", p.ID(), agents.CursorCli)
	}
}
