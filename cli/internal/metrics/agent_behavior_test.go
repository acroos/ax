package metrics

import (
	"testing"

	"github.com/austinroos/ax/internal/parsers"
)

func TestSelfCorrectionRate(t *testing.T) {
	// No errors
	sessions := []*parsers.ParsedSession{{BashErrors: 0, BashSuccesses: 10}}
	if got := SelfCorrectionRate(sessions); got != -1 {
		t.Errorf("expected -1 for no errors, got %f", got)
	}

	// Some errors, more successes
	sessions = []*parsers.ParsedSession{{BashErrors: 2, BashSuccesses: 8}}
	got := SelfCorrectionRate(sessions)
	if got < 0.79 || got > 0.81 {
		t.Errorf("expected ~0.80, got %f", got)
	}

	// All errors, no successes
	sessions = []*parsers.ParsedSession{{BashErrors: 5, BashSuccesses: 0}}
	if got := SelfCorrectionRate(sessions); got != 0 {
		t.Errorf("expected 0 for all errors, got %f", got)
	}
}

func TestContextEfficiency(t *testing.T) {
	sessions := []*parsers.ParsedSession{
		{
			FilesRead:     []string{"a.go", "b.go", "c.go", "d.go"},
			FilesModified: []string{"a.go", "b.go"},
		},
	}
	got := ContextEfficiency(sessions)
	if got < 0.49 || got > 0.51 {
		t.Errorf("expected ~0.50, got %f", got)
	}

	// No reads
	sessions = []*parsers.ParsedSession{{FilesRead: nil, FilesModified: []string{"a.go"}}}
	if got := ContextEfficiency(sessions); got != -1 {
		t.Errorf("expected -1 for no reads, got %f", got)
	}
}

func TestErrorRecoveryEfficiency(t *testing.T) {
	sessions := []*parsers.ParsedSession{
		{BashErrors: 3},
		{BashErrors: 1},
	}
	if got := ErrorRecoveryEfficiency(sessions); got != 4 {
		t.Errorf("expected 4 total errors, got %d", got)
	}
}
