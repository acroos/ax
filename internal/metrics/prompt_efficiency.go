package metrics

import "github.com/austinroos/ax/internal/parsers"

// MessagesPerPR counts total human messages across all sessions correlated to a PR.
func MessagesPerPR(sessions []*parsers.ParsedSession) int {
	total := 0
	for _, s := range sessions {
		total += s.HumanMessages
	}
	return total
}

// IterationDepth counts total human→assistant turn pairs across all sessions.
func IterationDepth(sessions []*parsers.ParsedSession) int {
	total := 0
	for _, s := range sessions {
		total += s.TurnCount
	}
	return total
}

// TokenCostForSessions sums the total dollar cost across sessions.
func TokenCostForSessions(sessions []*parsers.ParsedSession) float64 {
	total := 0.0
	for _, s := range sessions {
		total += s.TotalCostUSD
	}
	return total
}
