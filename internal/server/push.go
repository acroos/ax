package server

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/db"
)

const maxPushPayloadSize = 10 * 1024 * 1024 // 10MB

func (s *Server) handlePush(w http.ResponseWriter, r *http.Request) {
	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, maxPushPayloadSize)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "payload too large (max 10MB)"})
		return
	}

	var payload api.PushPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}

	if payload.Owner == "" || payload.Repo == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "owner and repo are required"})
		return
	}

	pushedBy := getAPIKeyName(r)
	counts, err := s.processPush(&payload, pushedBy)
	if err != nil {
		log.Printf("Push error from %s for %s/%s: %v", pushedBy, payload.Owner, payload.Repo, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to process push"})
		return
	}

	log.Printf("Push from %s: %s/%s — %d PRs, %d sessions, %d commits",
		pushedBy, payload.Owner, payload.Repo, counts["prs"], counts["sessions"], counts["commits"])

	writeJSON(w, http.StatusOK, api.PushResponse{
		OK:       true,
		Entities: counts,
	})
}

func (s *Server) processPush(payload *api.PushPayload, pushedBy string) (map[string]int, error) {
	counts := map[string]int{
		"repos":        0,
		"prs":          0,
		"commits":      0,
		"sessions":     0,
		"session_prs":  0,
		"pr_metrics":   0,
		"repo_metrics": 0,
	}

	// Use a transaction for atomicity
	tx, err := s.store.DB.Beginx()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// 1. Upsert repo
	repoID, err := db.UpsertRepo(tx, payload.RepoPath, payload.RemoteURL, payload.Owner, payload.Repo)
	if err != nil {
		return nil, err
	}
	counts["repos"] = 1

	// Build PR number → ID mapping
	prNumberToID := make(map[int]int64)

	// 2. Upsert PRs
	for _, prData := range payload.PRs {
		pr := api.PRToDB(prData, repoID)
		pr.PushedBy = sql.NullString{String: pushedBy, Valid: pushedBy != ""}
		prID, err := db.UpsertPR(tx, pr)
		if err != nil {
			log.Printf("  Warning: failed to upsert PR #%d: %v", prData.Number, err)
			continue
		}
		prNumberToID[prData.Number] = prID
		counts["prs"]++
	}

	// 3. Upsert sessions
	for _, sessData := range payload.Sessions {
		_, err := tx.Exec(`
			INSERT INTO sessions (id, repo_id, branch, started_at, ended_at, message_count, turn_count,
				input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
				total_cost_usd, primary_model, pushed_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				repo_id = excluded.repo_id,
				branch = excluded.branch,
				message_count = excluded.message_count,
				turn_count = excluded.turn_count,
				input_tokens = excluded.input_tokens,
				output_tokens = excluded.output_tokens,
				cache_creation_input_tokens = excluded.cache_creation_input_tokens,
				cache_read_input_tokens = excluded.cache_read_input_tokens,
				total_cost_usd = excluded.total_cost_usd,
				primary_model = excluded.primary_model,
				pushed_by = excluded.pushed_by
		`, sessData.ID, repoID,
			nullStr(sessData.Branch),
			nullInt64(sessData.StartedAt),
			nullInt64(sessData.EndedAt),
			sessData.MessageCount, sessData.TurnCount,
			sessData.InputTokens, sessData.OutputTokens,
			sessData.CacheCreationInputTokens, sessData.CacheReadInputTokens,
			sessData.TotalCostUSD,
			nullStr(sessData.PrimaryModel),
			pushedBy)
		if err != nil {
			log.Printf("  Warning: failed to upsert session %s: %v", sessData.ID, err)
			continue
		}
		counts["sessions"]++
	}

	// 4. Upsert commits
	for _, commitData := range payload.Commits {
		prID, hasPR := prNumberToID[commitData.PRNumber]
		var prIDNull sql.NullInt64
		if hasPR {
			prIDNull = sql.NullInt64{Int64: prID, Valid: true}
		}

		isClaude := 0
		if commitData.IsClaudeAuthored {
			isClaude = 1
		}
		isPostOpen := 0
		if commitData.IsPostOpen {
			isPostOpen = 1
		}

		err := db.UpsertCommit(tx, &db.Commit{
			SHA:              commitData.SHA,
			RepoID:           repoID,
			PRID:             prIDNull,
			Message:          sql.NullString{String: commitData.Message, Valid: commitData.Message != ""},
			Author:           sql.NullString{String: commitData.Author, Valid: commitData.Author != ""},
			CommittedAt:      sql.NullString{String: commitData.CommittedAt, Valid: commitData.CommittedAt != ""},
			IsClaudeAuthored: isClaude,
			IsPostOpen:       isPostOpen,
			Additions:        commitData.Additions,
			Deletions:        commitData.Deletions,
			FilesChanged:     commitData.FilesChanged,
		})
		if err != nil {
			log.Printf("  Warning: failed to upsert commit %s: %v", commitData.SHA, err)
			continue
		}
		counts["commits"]++
	}

	// 5. Upsert session-PR correlations
	for _, spData := range payload.SessionPRs {
		prID, ok := prNumberToID[spData.PRNumber]
		if !ok {
			continue
		}
		_, err := tx.Exec(`
			INSERT INTO session_prs (session_id, pr_id, confidence)
			VALUES (?, ?, ?)
			ON CONFLICT(session_id, pr_id) DO UPDATE SET confidence = excluded.confidence
		`, spData.SessionID, prID, spData.Confidence)
		if err != nil {
			continue
		}
		counts["session_prs"]++
	}

	// 6. Upsert PR metrics
	for _, metricsData := range payload.PRMetrics {
		prID, ok := prNumberToID[metricsData.PRNumber]
		if !ok {
			continue
		}
		m := api.PRMetricsToDB(metricsData, prID)
		if err := db.UpsertPRMetrics(tx, m); err != nil {
			log.Printf("  Warning: failed to upsert metrics for PR #%d: %v", metricsData.PRNumber, err)
			continue
		}
		counts["pr_metrics"]++
	}

	// 7. Upsert repo metrics
	if payload.RepoMetrics != nil {
		rm := &db.RepoMetrics{
			RepoID:          repoID,
			PeriodStart:     payload.RepoMetrics.PeriodStart,
			PeriodEnd:       payload.RepoMetrics.PeriodEnd,
			PeriodType:      payload.RepoMetrics.PeriodType,
			TotalSessions:   payload.RepoMetrics.TotalSessions,
			TotalTokens:     payload.RepoMetrics.TotalTokens,
			TotalCostUSD:    payload.RepoMetrics.TotalCostUSD,
			UnmergedTokens:  payload.RepoMetrics.UnmergedTokens,
			UnmergedCostUSD: payload.RepoMetrics.UnmergedCostUSD,
			UnmergedRate:    sql.NullFloat64{Float64: payload.RepoMetrics.UnmergedRate, Valid: true},
		}
		if err := db.UpsertRepoMetrics(tx, rm); err != nil {
			log.Printf("  Warning: failed to upsert repo metrics: %v", err)
		} else {
			counts["repo_metrics"] = 1
		}
	}

	// Auto-register as watched
	db.UpsertWatchedRepo(tx, &db.WatchedRepo{
		RepoID:              repoID,
		PollIntervalSeconds: 300,
		Enabled:             1,
	})

	return counts, tx.Commit()
}

func nullStr(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

func nullInt64(v int64) sql.NullInt64 {
	return sql.NullInt64{Int64: v, Valid: v != 0}
}
