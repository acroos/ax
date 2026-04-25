package metrics

import "github.com/austinroos/ax/internal/parsers"

// IterationDepth counts total human→assistant turn pairs across all sessions.
func IterationDepth(sessions []*parsers.ParsedSession) int {
	total := 0
	for _, s := range sessions {
		total += s.TurnCount
	}
	return total
}
