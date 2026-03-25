// Package pricing computes dollar costs from Claude API token usage.
// Prices are hardcoded and versioned so they can be updated when
// Anthropic changes pricing, and historical data can be recomputed.
package pricing

import "strings"

// PricingVersion tracks when the pricing table was last updated.
// Used to determine if stored costs should be recomputed.
const PricingVersion = "2026-03-24"

// ModelPricing contains per-million-token prices for a Claude model.
type ModelPricing struct {
	InputPerMTok         float64 // $/million input tokens
	OutputPerMTok        float64 // $/million output tokens
	CacheReadPerMTok     float64 // $/million cache read tokens
	CacheCreationPerMTok float64 // $/million cache creation tokens
}

// Models maps model identifiers to their pricing.
// Includes both full model IDs and short aliases.
var Models = map[string]ModelPricing{
	// Claude Opus 4 / 4.5 / 4.6
	"claude-opus-4-6":                {InputPerMTok: 15.0, OutputPerMTok: 75.0, CacheReadPerMTok: 1.5, CacheCreationPerMTok: 18.75},
	"claude-opus-4-5-20250620":       {InputPerMTok: 15.0, OutputPerMTok: 75.0, CacheReadPerMTok: 1.5, CacheCreationPerMTok: 18.75},
	"claude-opus-4-20250514":         {InputPerMTok: 15.0, OutputPerMTok: 75.0, CacheReadPerMTok: 1.5, CacheCreationPerMTok: 18.75},

	// Claude Sonnet 4 / 4.5 / 4.6
	"claude-sonnet-4-6":              {InputPerMTok: 3.0, OutputPerMTok: 15.0, CacheReadPerMTok: 0.3, CacheCreationPerMTok: 3.75},
	"claude-sonnet-4-5-20250514":     {InputPerMTok: 3.0, OutputPerMTok: 15.0, CacheReadPerMTok: 0.3, CacheCreationPerMTok: 3.75},
	"claude-sonnet-4-20250514":       {InputPerMTok: 3.0, OutputPerMTok: 15.0, CacheReadPerMTok: 0.3, CacheCreationPerMTok: 3.75},

	// Claude Haiku 4.5
	"claude-haiku-4-5-20251001":      {InputPerMTok: 0.80, OutputPerMTok: 4.0, CacheReadPerMTok: 0.08, CacheCreationPerMTok: 1.0},

	// Legacy Claude 3.5
	"claude-3-5-sonnet-20241022":     {InputPerMTok: 3.0, OutputPerMTok: 15.0, CacheReadPerMTok: 0.3, CacheCreationPerMTok: 3.75},
	"claude-3-5-haiku-20241022":      {InputPerMTok: 0.80, OutputPerMTok: 4.0, CacheReadPerMTok: 0.08, CacheCreationPerMTok: 1.0},
}

// defaultPricing is used when the model is not recognized.
// Falls back to Sonnet pricing as the most common model in Claude Code.
var defaultPricing = Models["claude-sonnet-4-6"]

// LookupModel returns the pricing for a model ID.
// Tries exact match first, then prefix matching for versioned model IDs.
// Falls back to Sonnet pricing for unknown models.
func LookupModel(model string) ModelPricing {
	model = strings.TrimSpace(model)

	// Exact match
	if p, ok := Models[model]; ok {
		return p
	}

	// Prefix match (handles versioned model IDs like "claude-sonnet-4-6-20260101")
	for key, p := range Models {
		if strings.HasPrefix(model, key) {
			return p
		}
	}

	// Family match (handles aliases like "opus", "sonnet", "haiku")
	lower := strings.ToLower(model)
	if strings.Contains(lower, "opus") {
		return Models["claude-opus-4-6"]
	}
	if strings.Contains(lower, "haiku") {
		return Models["claude-haiku-4-5-20251001"]
	}

	return defaultPricing
}

// ComputeCost calculates the dollar cost for a single message's token usage.
func ComputeCost(model string, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens int) float64 {
	p := LookupModel(model)

	cost := float64(inputTokens) * p.InputPerMTok / 1_000_000
	cost += float64(outputTokens) * p.OutputPerMTok / 1_000_000
	cost += float64(cacheReadTokens) * p.CacheReadPerMTok / 1_000_000
	cost += float64(cacheCreationTokens) * p.CacheCreationPerMTok / 1_000_000

	return cost
}

// FormatCost formats a dollar amount for display (e.g., "$1.23").
func FormatCost(cost float64) string {
	if cost < 0.01 {
		return "<$0.01"
	}
	return "$" + formatFloat(cost)
}

func formatFloat(f float64) string {
	// Simple two-decimal formatting without fmt dependency
	cents := int(f*100 + 0.5)
	dollars := cents / 100
	remainder := cents % 100
	if remainder < 10 {
		return itoa(dollars) + ".0" + itoa(remainder)
	}
	return itoa(dollars) + "." + itoa(remainder)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}
