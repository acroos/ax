package metrics

import (
	"testing"

	"github.com/austinroos/ax/internal/parsers"
)

func TestIterationDepth(t *testing.T) {
	sessions := []*parsers.ParsedSession{
		{TurnCount: 4},
		{TurnCount: 2},
	}
	if got := IterationDepth(sessions); got != 6 {
		t.Errorf("IterationDepth = %d, want 6", got)
	}
}

func TestTokenCostForSessions(t *testing.T) {
	sessions := []*parsers.ParsedSession{
		{TotalCostUSD: 1.50},
		{TotalCostUSD: 2.25},
	}
	got := TokenCostForSessions(sessions)
	if got < 3.74 || got > 3.76 {
		t.Errorf("TokenCostForSessions = %.2f, want 3.75", got)
	}
}
