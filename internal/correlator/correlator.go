// Package correlator links Claude Code sessions to GitHub pull requests.
// It uses a layered strategy: direct PR URL extraction, branch matching,
// commit SHA matching, and timestamp heuristics.
package correlator

import (
	"strings"

	"github.com/austinroos/ax/internal/parsers"
)

// Confidence levels for session-to-PR correlation.
const (
	ConfidenceDirect    = "direct"    // PR URL found in session output
	ConfidenceBranch    = "branch"    // session branch matches PR head branch
	ConfidenceCommit    = "commit"    // commit SHAs from session found in PR
	ConfidenceHeuristic = "heuristic" // time-window overlap
)

// Correlation represents a link between a session and a PR.
type Correlation struct {
	SessionID  string
	PRNumber   int
	Confidence string
}

// CorrelateSession attempts to link a parsed session to PRs.
// It tries strategies in order of confidence (highest first).
func CorrelateSession(session *parsers.ParsedSession, prs []parsers.GHPullRequest,
	prCommits map[int][]parsers.GHCommit) []Correlation {

	var correlations []Correlation
	matched := make(map[int]bool)

	// Strategy 1: Direct — PR URLs found in session output
	for _, url := range session.PRURLs {
		for _, pr := range prs {
			if pr.URL == url || strings.HasSuffix(url, pr.URL) || strings.HasSuffix(pr.URL, url) {
				if !matched[pr.Number] {
					correlations = append(correlations, Correlation{
						SessionID:  session.ID,
						PRNumber:   pr.Number,
						Confidence: ConfidenceDirect,
					})
					matched[pr.Number] = true
				}
			}
		}
	}

	// Strategy 2: Branch matching
	if session.Branch != "" && session.Branch != "main" && session.Branch != "master" {
		for _, pr := range prs {
			if pr.HeadRefName == session.Branch && !matched[pr.Number] {
				correlations = append(correlations, Correlation{
					SessionID:  session.ID,
					PRNumber:   pr.Number,
					Confidence: ConfidenceBranch,
				})
				matched[pr.Number] = true
			}
		}
	}

	// Strategy 3: Commit SHA matching
	if len(session.CommitSHAs) > 0 {
		for prNum, commits := range prCommits {
			if matched[prNum] {
				continue
			}
			for _, sessionSHA := range session.CommitSHAs {
				for _, prCommit := range commits {
					// Short SHA prefix match (session captures short SHAs)
					if strings.HasPrefix(prCommit.SHA, sessionSHA) {
						correlations = append(correlations, Correlation{
							SessionID:  session.ID,
							PRNumber:   prNum,
							Confidence: ConfidenceCommit,
						})
						matched[prNum] = true
						break
					}
				}
				if matched[prNum] {
					break
				}
			}
		}
	}

	return correlations
}
