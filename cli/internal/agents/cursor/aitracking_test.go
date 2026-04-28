package cursor

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/austinroos/ax/internal/agents"

	_ "modernc.org/sqlite"
)

// createTestDB creates a minimal ai-code-tracking.db at the given path with
// the tables we read. Returns an open *sql.DB for inserting rows; the caller
// must close it before fetchExtras opens the file read-only.
func createTestDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("createTestDB: sql.Open: %v", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS conversation_summaries (
			conversationId TEXT PRIMARY KEY,
			title          TEXT,
			tldr           TEXT,
			overview       TEXT,
			summaryBullets TEXT,
			model          TEXT,
			mode           TEXT,
			updatedAt      TEXT
		);
		CREATE TABLE IF NOT EXISTS scored_commits (
			commitHash          TEXT,
			branchName          TEXT,
			scoredAt            TEXT,
			linesAdded          INTEGER,
			linesDeleted        INTEGER,
			tabLinesAdded       INTEGER,
			tabLinesDeleted     INTEGER,
			composerLinesAdded  INTEGER,
			composerLinesDeleted INTEGER,
			humanLinesAdded     INTEGER,
			humanLinesDeleted   INTEGER,
			blankLinesAdded     INTEGER,
			blankLinesDeleted   INTEGER,
			commitMessage       TEXT,
			commitDate          TEXT,
			v1AiPercentage      REAL,
			v2AiPercentage      REAL,
			PRIMARY KEY (commitHash, branchName)
		);
	`)
	if err != nil {
		t.Fatalf("createTestDB: CREATE TABLE: %v", err)
	}
	return db
}

// dbPath returns a temp file path for a test DB within a temp directory
// rooted at homeDir/ai-tracking/.
func dbPath(t *testing.T, homeDir string) string {
	t.Helper()
	dir := filepath.Join(homeDir, "ai-tracking")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("MkdirAll %s: %v", dir, err)
	}
	return filepath.Join(dir, "ai-code-tracking.db")
}

// TestFetchExtrasMissingDBReturnsNil verifies that when no DB file exists,
// fetchExtras returns (nil, nil) without error.
func TestFetchExtrasMissingDBReturnsNil(t *testing.T) {
	homeDir := t.TempDir() // empty — no ai-tracking/ subdirectory
	extras, err := fetchExtras(homeDir, "conv-123", 0, 0)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if extras != nil {
		t.Fatalf("expected nil extras, got %v", extras)
	}
}

// TestFetchExtrasReadsConversationSummary inserts a conversation_summaries row
// and asserts it is recovered in the extras map.
func TestFetchExtrasReadsConversationSummary(t *testing.T) {
	homeDir := t.TempDir()
	path := dbPath(t, homeDir)

	db := createTestDB(t, path)
	_, err := db.Exec(`
		INSERT INTO conversation_summaries (conversationId, title, tldr, model)
		VALUES ('conv-abc', 'Fix README', 'Updated the title', 'claude-3-5-sonnet')
	`)
	if err != nil {
		t.Fatalf("INSERT conversation_summaries: %v", err)
	}
	db.Close() // close write handle before opening read-only

	extras, err := fetchExtras(homeDir, "conv-abc", 0, 0)
	if err != nil {
		t.Fatalf("fetchExtras error: %v", err)
	}
	if extras == nil {
		t.Fatal("expected non-nil extras")
	}

	summary, ok := extras["conversation_summary"].(ConversationSummary)
	if !ok {
		t.Fatalf("expected extras[conversation_summary] to be ConversationSummary, got %T", extras["conversation_summary"])
	}
	if summary.Title != "Fix README" {
		t.Errorf("Title = %q, want %q", summary.Title, "Fix README")
	}
	if summary.TLDR != "Updated the title" {
		t.Errorf("TLDR = %q, want %q", summary.TLDR, "Updated the title")
	}
	if summary.Model != "claude-3-5-sonnet" {
		t.Errorf("Model = %q, want %q", summary.Model, "claude-3-5-sonnet")
	}
}

// TestFetchExtrasReadsScoredCommits inserts a scored_commits row with a
// scoredAt timestamp within the test window and asserts it is recovered.
func TestFetchExtrasReadsScoredCommits(t *testing.T) {
	homeDir := t.TempDir()
	path := dbPath(t, homeDir)

	db := createTestDB(t, path)

	// Session window: 2026-04-01T10:00:00Z → 2026-04-01T11:00:00Z (ms)
	startMs := int64(1775037600000)
	endMs := int64(1775041200000)

	// scoredAt is ISO 8601 — within the window.
	_, err := db.Exec(`
		INSERT INTO scored_commits (
			commitHash, branchName, scoredAt,
			linesAdded, linesDeleted, humanLinesAdded, composerLinesAdded,
			v2AiPercentage, commitDate
		) VALUES (
			'abc123', 'main', '2026-04-01T10:30:00Z',
			50, 10, 20, 30,
			0.65, '2026-04-01T10:28:00Z'
		)
	`)
	if err != nil {
		t.Fatalf("INSERT scored_commits: %v", err)
	}
	db.Close()

	extras, err := fetchExtras(homeDir, "conv-xyz", startMs, endMs)
	if err != nil {
		t.Fatalf("fetchExtras error: %v", err)
	}
	if extras == nil {
		t.Fatal("expected non-nil extras")
	}

	attr, ok := extras["commit_attribution"].(map[string]any)
	if !ok {
		t.Fatalf("expected commit_attribution map, got %T", extras["commit_attribution"])
	}
	commits, ok := attr["commits"].([]ScoredCommit)
	if !ok {
		t.Fatalf("expected []ScoredCommit, got %T", attr["commits"])
	}
	if len(commits) != 1 {
		t.Fatalf("expected 1 commit, got %d", len(commits))
	}
	c := commits[0]
	if c.SHA != "abc123" {
		t.Errorf("SHA = %q, want abc123", c.SHA)
	}
	if c.Branch != "main" {
		t.Errorf("Branch = %q, want main", c.Branch)
	}
	if c.LinesAdded != 50 {
		t.Errorf("LinesAdded = %d, want 50", c.LinesAdded)
	}
	if c.HumanLinesAdded != 20 {
		t.Errorf("HumanLinesAdded = %d, want 20", c.HumanLinesAdded)
	}
}

// TestFetchExtrasScoredCommitsOutsideWindowExcluded verifies that a commit
// whose scoredAt falls outside the session window is NOT included.
func TestFetchExtrasScoredCommitsOutsideWindowExcluded(t *testing.T) {
	homeDir := t.TempDir()
	path := dbPath(t, homeDir)

	db := createTestDB(t, path)

	startMs := int64(1775037600000) // 2026-04-01T10:00:00Z
	endMs := int64(1775041200000)   // 2026-04-01T11:00:00Z

	// scoredAt is OUTSIDE the window (after endMs).
	_, err := db.Exec(`
		INSERT INTO scored_commits (
			commitHash, branchName, scoredAt,
			linesAdded, linesDeleted, humanLinesAdded, composerLinesAdded,
			v2AiPercentage, commitDate
		) VALUES (
			'def456', 'feature', '2026-04-01T12:00:00Z',
			5, 2, 3, 2,
			0.40, '2026-04-01T11:55:00Z'
		)
	`)
	if err != nil {
		t.Fatalf("INSERT scored_commits: %v", err)
	}
	db.Close()

	extras, err := fetchExtras(homeDir, "conv-xyz", startMs, endMs)
	if err != nil {
		t.Fatalf("fetchExtras error: %v", err)
	}
	// No commits in window, no conversation summary → nil extras.
	if extras != nil {
		t.Fatalf("expected nil extras when commit is outside window, got %v", extras)
	}
}

// TestExtrasIntegratedIntoParsedSession exercises the full provider.Parse path
// with a pre-populated ai-tracking DB and verifies that ParsedSession.Extras
// contains both commit_attribution and conversation_summary keys.
func TestExtrasIntegratedIntoParsedSession(t *testing.T) {
	// Set up a fake CURSOR_HOME directory with the transcript testdata
	// and a matching ai-tracking DB.
	cursorHome := t.TempDir()
	t.Setenv("CURSOR_HOME", cursorHome)

	// The test transcript lives in testdata/; derive its session timestamps.
	// transcript.jsonl has timestamp 2026-04-01T10:00:00Z → 1743498000000 ms.
	sessionID := "test-session-extras"

	// Mirror the transcript into cursorHome so Parse can find it.
	projectPath := "/Users/test/dev/myproject"
	encoded := encodePath(projectPath)
	transcriptDir := filepath.Join(cursorHome, "projects", encoded, "agent-transcripts", sessionID)
	if err := os.MkdirAll(transcriptDir, 0o755); err != nil {
		t.Fatal(err)
	}
	transcriptDst := filepath.Join(transcriptDir, sessionID+".jsonl")

	// Read the canonical testdata transcript and write it into the temp home.
	transcriptSrc := filepath.Join("testdata", "transcript.jsonl")
	content, err := os.ReadFile(transcriptSrc)
	if err != nil {
		t.Fatalf("ReadFile testdata/transcript.jsonl: %v", err)
	}
	if err := os.WriteFile(transcriptDst, content, 0o644); err != nil {
		t.Fatal(err)
	}

	// Set up the ai-tracking DB.
	path := dbPath(t, cursorHome)
	db := createTestDB(t, path)

	// The transcript's timestamp is 2026-04-01T10:00:00Z.
	// startMs = endMs = 1743498000000; use a window around it.
	// Insert conversation_summary for this session.
	_, err = db.Exec(`
		INSERT INTO conversation_summaries (conversationId, title, tldr, model)
		VALUES (?, 'Fix README title', 'Updated heading', 'claude-3-5-sonnet')
	`, sessionID)
	if err != nil {
		t.Fatalf("INSERT conversation_summaries: %v", err)
	}

	// Insert a commit within the session's time window.
	_, err = db.Exec(`
		INSERT INTO scored_commits (
			commitHash, branchName, scoredAt,
			linesAdded, linesDeleted, humanLinesAdded, composerLinesAdded,
			v2AiPercentage, commitDate
		) VALUES (
			'deadbeef', 'main', '2026-04-01T10:00:00Z',
			10, 2, 5, 5,
			0.50, '2026-04-01T09:59:00Z'
		)
	`)
	if err != nil {
		t.Fatalf("INSERT scored_commits: %v", err)
	}
	db.Close()

	p := New()
	loc := agents.SessionLocator{
		AgentID:   agents.CursorCli,
		SessionID: sessionID,
		Path:      transcriptDst,
		OwnerRepo: "owner/repo",
	}
	sess, err := p.Parse(loc)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if sess.Extras == nil {
		t.Fatal("expected Extras to be populated, got nil")
	}
	if _, ok := sess.Extras["conversation_summary"]; !ok {
		t.Error("expected conversation_summary in Extras")
	}
	if _, ok := sess.Extras["commit_attribution"]; !ok {
		t.Error("expected commit_attribution in Extras")
	}
}
