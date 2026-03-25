package push

import (
	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/db"
	"github.com/jmoiron/sqlx"
)

// ExtractPayload reads all data for a repo from the local database
// and packages it as a PushPayload for sending to the team server.
func ExtractPayload(database *sqlx.DB, repoID int64) (*api.PushPayload, error) {
	// Get repo info
	var repo db.Repo
	if err := database.Get(&repo, "SELECT * FROM repos WHERE id = ?", repoID); err != nil {
		return nil, err
	}

	payload := &api.PushPayload{
		RepoPath:  repo.Path,
		RemoteURL: repo.RemoteURL.String,
		Owner:     repo.GithubOwner.String,
		Repo:      repo.GithubRepo.String,
	}

	// Get all PRs
	prs, err := db.GetPRsForRepo(database, repoID)
	if err != nil {
		return nil, err
	}

	prIDToNumber := make(map[int64]int)
	for _, pr := range prs {
		payload.PRs = append(payload.PRs, api.PRFromDB(&pr))
		prIDToNumber[pr.ID] = pr.Number

		// Get metrics for this PR
		m, _ := db.GetPRMetrics(database, pr.ID)
		if m != nil {
			payload.PRMetrics = append(payload.PRMetrics, api.PRMetricsFromDB(m, pr.Number))
		}
	}

	// Get sessions
	var sessions []db.Session
	database.Select(&sessions, "SELECT * FROM sessions WHERE repo_id = ?", repoID)
	for _, s := range sessions {
		payload.Sessions = append(payload.Sessions, api.SessionFromDB(&s))
	}

	// Get commits
	var commits []db.Commit
	database.Select(&commits, "SELECT * FROM commits WHERE repo_id = ?", repoID)
	for _, c := range commits {
		prNumber := 0
		if c.PRID.Valid {
			prNumber = prIDToNumber[c.PRID.Int64]
		}
		payload.Commits = append(payload.Commits, api.CommitData{
			SHA:              c.SHA,
			PRNumber:         prNumber,
			Message:          c.Message.String,
			Author:           c.Author.String,
			CommittedAt:      c.CommittedAt.String,
			IsClaudeAuthored: c.IsClaudeAuthored == 1,
			IsPostOpen:       c.IsPostOpen == 1,
			Additions:        c.Additions,
			Deletions:        c.Deletions,
			FilesChanged:     c.FilesChanged,
		})
	}

	// Get session-PR correlations
	var sessionPRs []db.SessionPR
	database.Select(&sessionPRs, `
		SELECT sp.* FROM session_prs sp
		JOIN prs p ON sp.pr_id = p.id
		WHERE p.repo_id = ?
	`, repoID)
	for _, sp := range sessionPRs {
		prNumber := prIDToNumber[sp.PRID]
		if prNumber > 0 {
			payload.SessionPRs = append(payload.SessionPRs, api.SessionPRData{
				SessionID:  sp.SessionID,
				PRNumber:   prNumber,
				Confidence: sp.Confidence,
			})
		}
	}

	// Get repo metrics
	repoMetrics, _ := db.GetRepoMetrics(database, repoID, "all")
	if len(repoMetrics) > 0 {
		rm := repoMetrics[0]
		payload.RepoMetrics = &api.RepoMetricsData{
			PeriodStart:     rm.PeriodStart,
			PeriodEnd:       rm.PeriodEnd,
			PeriodType:      rm.PeriodType,
			TotalSessions:   rm.TotalSessions,
			TotalTokens:     rm.TotalTokens,
			TotalCostUSD:    rm.TotalCostUSD,
			UnmergedTokens:  rm.UnmergedTokens,
			UnmergedCostUSD: rm.UnmergedCostUSD,
			UnmergedRate:    rm.UnmergedRate.Float64,
		}
	}

	return payload, nil
}
