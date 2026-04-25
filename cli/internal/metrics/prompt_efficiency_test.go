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
