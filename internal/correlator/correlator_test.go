package correlator

import (
	"testing"

	"github.com/austinroos/ax/internal/parsers"
)

func TestCorrelateSession_DirectURL(t *testing.T) {
	session := &parsers.ParsedSession{
		ID:     "session-1",
		PRURLs: []string{"https://github.com/test/repo/pull/5"},
	}
	prs := []parsers.GHPullRequest{
		{Number: 5, URL: "https://github.com/test/repo/pull/5", HeadRefName: "feat-x"},
		{Number: 6, URL: "https://github.com/test/repo/pull/6", HeadRefName: "feat-y"},
	}

	results := CorrelateSession(session, prs, nil)
	if len(results) != 1 {
		t.Fatalf("expected 1 correlation, got %d", len(results))
	}
	if results[0].PRNumber != 5 {
		t.Errorf("expected PR #5, got #%d", results[0].PRNumber)
	}
	if results[0].Confidence != ConfidenceDirect {
		t.Errorf("expected direct confidence, got %s", results[0].Confidence)
	}
}

func TestCorrelateSession_BranchMatch(t *testing.T) {
	session := &parsers.ParsedSession{
		ID:     "session-1",
		Branch: "feat-x",
	}
	prs := []parsers.GHPullRequest{
		{Number: 5, HeadRefName: "feat-x"},
		{Number: 6, HeadRefName: "feat-y"},
	}

	results := CorrelateSession(session, prs, nil)
	if len(results) != 1 {
		t.Fatalf("expected 1 correlation, got %d", len(results))
	}
	if results[0].PRNumber != 5 {
		t.Errorf("expected PR #5, got #%d", results[0].PRNumber)
	}
	if results[0].Confidence != ConfidenceBranch {
		t.Errorf("expected branch confidence, got %s", results[0].Confidence)
	}
}

func TestCorrelateSession_SkipsMainBranch(t *testing.T) {
	session := &parsers.ParsedSession{
		ID:     "session-1",
		Branch: "main",
	}
	prs := []parsers.GHPullRequest{
		{Number: 5, HeadRefName: "main"},
	}

	results := CorrelateSession(session, prs, nil)
	if len(results) != 0 {
		t.Errorf("expected no correlations for main branch, got %d", len(results))
	}
}

func TestCorrelateSession_CommitMatch(t *testing.T) {
	session := &parsers.ParsedSession{
		ID:         "session-1",
		Branch:     "main", // won't match by branch
		CommitSHAs: []string{"abc1234"},
	}
	prs := []parsers.GHPullRequest{
		{Number: 5, HeadRefName: "feat-x"},
	}
	prCommits := map[int][]parsers.GHCommit{
		5: {
			{SHA: "abc123456789abcdef"},
			{SHA: "def456789abcdef01"},
		},
	}

	results := CorrelateSession(session, prs, prCommits)
	if len(results) != 1 {
		t.Fatalf("expected 1 correlation, got %d", len(results))
	}
	if results[0].Confidence != ConfidenceCommit {
		t.Errorf("expected commit confidence, got %s", results[0].Confidence)
	}
}

func TestCorrelateSession_NoDuplicates(t *testing.T) {
	session := &parsers.ParsedSession{
		ID:         "session-1",
		Branch:     "feat-x",
		PRURLs:     []string{"https://github.com/test/repo/pull/5"},
		CommitSHAs: []string{"abc1234"},
	}
	prs := []parsers.GHPullRequest{
		{Number: 5, URL: "https://github.com/test/repo/pull/5", HeadRefName: "feat-x"},
	}
	prCommits := map[int][]parsers.GHCommit{
		5: {{SHA: "abc123456789"}},
	}

	results := CorrelateSession(session, prs, prCommits)
	if len(results) != 1 {
		t.Errorf("expected 1 correlation (no duplicates), got %d", len(results))
	}
	// Should use highest confidence (direct)
	if results[0].Confidence != ConfidenceDirect {
		t.Errorf("expected direct confidence (highest), got %s", results[0].Confidence)
	}
}
