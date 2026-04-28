package cursor

import (
	"database/sql"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite" // pure-Go SQLite driver, no CGO
)

// openAITrackingDB opens the Cursor AI tracking database read-only.
// The path is homeDir/ai-tracking/ai-code-tracking.db where homeDir
// is the cursor home directory (typically ~/.cursor).
//
// Returns (nil, nil) if the file does not exist — callers treat this as
// "no data available" rather than an error.
//
// The file is opened with ?mode=ro&immutable=1 so we never contend with
// Cursor's own process that may have the DB open for writing.
func openAITrackingDB(homeDir string) (*sql.DB, error) {
	path := filepath.Join(homeDir, "ai-tracking", "ai-code-tracking.db")
	if _, err := os.Stat(path); err != nil {
		// File absent or inaccessible — not an error.
		return nil, nil
	}
	return sql.Open("sqlite", path+"?mode=ro&immutable=1")
}

// ScoredCommit represents one row from the scored_commits table.
// Fields mirror the Cursor schema; only the subset we surface is included.
type ScoredCommit struct {
	SHA                string  `json:"sha"`
	Branch             string  `json:"branch"`
	LinesAdded         int     `json:"lines_added"`
	LinesDeleted       int     `json:"lines_deleted"`
	HumanLinesAdded    int     `json:"human_lines_added"`
	ComposerLinesAdded int     `json:"composer_lines_added"`
	AiPctV2            float64 `json:"ai_pct_v2"`
	CommittedAt        string  `json:"committed_at"`
}

// ConversationSummary represents a row from the conversation_summaries table.
type ConversationSummary struct {
	Title string `json:"title,omitempty"`
	TLDR  string `json:"tldr,omitempty"`
	Model string `json:"model,omitempty"`
}

// fetchExtras reads scored_commits and conversation_summaries from the Cursor
// AI tracking database and returns a JSON-serialisable extras blob to attach
// to ParsedSession.Extras.
//
// conversationID is the Cursor agent UUID (i.e. the session ID).
// startedAtMs and endedAtMs are Unix milliseconds from the parsed transcript;
// they bound the window used to match scored_commits to this session.
//
// APPROXIMATION NOTE: scored_commits has no conversationId column. The join
// between a conversation and its commits goes through ai_code_hashes, which
// is not read here. Instead, this function selects all commits whose scoredAt
// timestamp (an ISO 8601 string in the observed schema) falls within the
// session's time window. This is an approximation: commits authored during a
// session window in a single-developer environment are overwhelmingly likely
// to belong to that session, but may include unrelated commits in busy repos.
// Refine after observing more real Cursor data — the extras column is the
// landing zone, not a finalized metric.
//
// Returns (nil, nil) when the database is absent or contains no relevant data.
// Errors from individual rows are skipped (defensive; Cursor schema can vary
// between versions).
func fetchExtras(homeDir, conversationID string, startedAtMs, endedAtMs int64) (map[string]any, error) {
	db, err := openAITrackingDB(homeDir)
	if err != nil || db == nil {
		return nil, err
	}
	defer db.Close()

	extras := map[string]any{}

	// --- conversation_summary ---
	// One row per conversation; look up by conversationId directly.
	var summary ConversationSummary
	row := db.QueryRow(
		`SELECT title, tldr, model FROM conversation_summaries WHERE conversationId = ?`,
		conversationID,
	)
	if scanErr := row.Scan(&summary.Title, &summary.TLDR, &summary.Model); scanErr == nil {
		extras["conversation_summary"] = summary
	}
	// sql.ErrNoRows or table-not-found are silently skipped.

	// --- scored_commits (time-window approximation) ---
	// scoredAt is an ISO 8601 string in the observed schema. Convert the
	// session boundaries to RFC3339 so the SQL comparison is string-sortable.
	// SQLite sorts ISO 8601 strings lexicographically correctly.
	startISO := msToISO(startedAtMs)
	endISO := msToISO(endedAtMs)

	rows, queryErr := db.Query(`
		SELECT commitHash, branchName, linesAdded, linesDeleted,
		       humanLinesAdded, composerLinesAdded, v2AiPercentage, commitDate
		FROM scored_commits
		WHERE scoredAt >= ? AND scoredAt <= ?
		ORDER BY commitDate DESC
		LIMIT 100
	`, startISO, endISO)
	if queryErr == nil {
		defer rows.Close()
		var commits []ScoredCommit
		for rows.Next() {
			var c ScoredCommit
			if scanErr := rows.Scan(
				&c.SHA, &c.Branch, &c.LinesAdded, &c.LinesDeleted,
				&c.HumanLinesAdded, &c.ComposerLinesAdded, &c.AiPctV2, &c.CommittedAt,
			); scanErr != nil {
				continue // skip malformed rows; schema may vary between Cursor versions
			}
			commits = append(commits, c)
		}
		if len(commits) > 0 {
			extras["commit_attribution"] = map[string]any{"commits": commits}
		}
	}
	// If the query failed (e.g. table doesn't exist yet in this Cursor version),
	// we simply omit the commit_attribution key — fail open, don't crash.

	if len(extras) == 0 {
		return nil, nil
	}
	return extras, nil
}

// msToISO converts Unix milliseconds to an RFC3339 UTC string suitable for
// lexicographic comparison against ISO 8601 values stored in SQLite.
// Returns an empty string for zero values.
func msToISO(ms int64) string {
	if ms == 0 {
		return ""
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339)
}
