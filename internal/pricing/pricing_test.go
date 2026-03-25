package pricing

import (
	"math"
	"testing"
)

func almostEqual(a, b, tolerance float64) bool {
	return math.Abs(a-b) < tolerance
}

func TestComputeCost_Sonnet(t *testing.T) {
	// 1M input tokens at $3/MTok = $3.00
	cost := ComputeCost("claude-sonnet-4-6", 1_000_000, 0, 0, 0)
	if !almostEqual(cost, 3.0, 0.001) {
		t.Errorf("expected $3.00 for 1M input tokens, got $%.4f", cost)
	}

	// 1M output tokens at $15/MTok = $15.00
	cost = ComputeCost("claude-sonnet-4-6", 0, 1_000_000, 0, 0)
	if !almostEqual(cost, 15.0, 0.001) {
		t.Errorf("expected $15.00 for 1M output tokens, got $%.4f", cost)
	}

	// Mixed usage: 100k input + 50k output + 500k cache read
	// = (100k * 3/1M) + (50k * 15/1M) + (500k * 0.3/1M)
	// = 0.30 + 0.75 + 0.15 = $1.20
	cost = ComputeCost("claude-sonnet-4-6", 100_000, 50_000, 500_000, 0)
	if !almostEqual(cost, 1.20, 0.001) {
		t.Errorf("expected $1.20 for mixed usage, got $%.4f", cost)
	}
}

func TestComputeCost_Opus(t *testing.T) {
	// 1M input tokens at $15/MTok = $15.00
	cost := ComputeCost("claude-opus-4-6", 1_000_000, 0, 0, 0)
	if !almostEqual(cost, 15.0, 0.001) {
		t.Errorf("expected $15.00 for 1M Opus input tokens, got $%.4f", cost)
	}

	// 1M output tokens at $75/MTok = $75.00
	cost = ComputeCost("claude-opus-4-6", 0, 1_000_000, 0, 0)
	if !almostEqual(cost, 75.0, 0.001) {
		t.Errorf("expected $75.00 for 1M Opus output tokens, got $%.4f", cost)
	}
}

func TestComputeCost_Haiku(t *testing.T) {
	// 1M input tokens at $0.80/MTok = $0.80
	cost := ComputeCost("claude-haiku-4-5-20251001", 1_000_000, 0, 0, 0)
	if !almostEqual(cost, 0.80, 0.001) {
		t.Errorf("expected $0.80 for 1M Haiku input tokens, got $%.4f", cost)
	}
}

func TestComputeCost_CacheCreation(t *testing.T) {
	// Sonnet: 1M cache creation tokens at $3.75/MTok = $3.75
	cost := ComputeCost("claude-sonnet-4-6", 0, 0, 0, 1_000_000)
	if !almostEqual(cost, 3.75, 0.001) {
		t.Errorf("expected $3.75 for 1M cache creation tokens, got $%.4f", cost)
	}
}

func TestLookupModel_FallbackToSonnet(t *testing.T) {
	p := LookupModel("some-unknown-model")
	if p.InputPerMTok != 3.0 {
		t.Errorf("expected Sonnet fallback pricing ($3.00/MTok), got $%.2f", p.InputPerMTok)
	}
}

func TestLookupModel_FamilyMatch(t *testing.T) {
	p := LookupModel("opus")
	if p.InputPerMTok != 15.0 {
		t.Errorf("expected Opus pricing for 'opus' alias, got $%.2f", p.InputPerMTok)
	}

	p = LookupModel("haiku")
	if p.InputPerMTok != 0.80 {
		t.Errorf("expected Haiku pricing for 'haiku' alias, got $%.2f", p.InputPerMTok)
	}
}

func TestFormatCost(t *testing.T) {
	tests := []struct {
		cost float64
		want string
	}{
		{0.001, "<$0.01"},
		{1.20, "$1.20"},
		{0.50, "$0.50"},
		{15.00, "$15.00"},
		{123.45, "$123.45"},
	}
	for _, tt := range tests {
		got := FormatCost(tt.cost)
		if got != tt.want {
			t.Errorf("FormatCost(%f) = %q, want %q", tt.cost, got, tt.want)
		}
	}
}
