package server

import (
	"database/sql"
	"net/http"

	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/db"
)

// handleListRepos returns all tracked repositories.
func (s *Server) handleListRepos(w http.ResponseWriter, r *http.Request) {
	repos, err := db.ListRepos(s.store.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list repos"})
		return
	}

	type repoResponse struct {
		ID           int64  `json:"id"`
		Path         string `json:"path"`
		GithubOwner  string `json:"github_owner,omitempty"`
		GithubRepo   string `json:"github_repo,omitempty"`
		LastSyncedAt string `json:"last_synced_at,omitempty"`
	}

	var result []repoResponse
	for _, r := range repos {
		result = append(result, repoResponse{
			ID:           r.ID,
			Path:         r.Path,
			GithubOwner:  r.GithubOwner.String,
			GithubRepo:   r.GithubRepo.String,
			LastSyncedAt: r.LastSyncedAt.String,
		})
	}

	writeJSON(w, http.StatusOK, result)
}

// handleListPRs returns finalized PRs with metrics for a repo.
func (s *Server) handleListPRs(w http.ResponseWriter, r *http.Request) {
	repoID, err := parseIntParam(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid repo ID"})
		return
	}

	prs, err := db.GetFinalizedPRsForRepo(s.store.DB, repoID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list PRs"})
		return
	}

	// Look up repo for owner/name
	var owner, repoName string
	row := s.store.DB.QueryRow("SELECT COALESCE(github_owner,''), COALESCE(github_repo,'') FROM repos WHERE id = ?", repoID)
	row.Scan(&owner, &repoName)

	type prWithMetrics struct {
		api.PRData     `json:",inline"`
		GithubOwner    string            `json:"github_owner"`
		GithubRepo     string            `json:"github_repo"`
		ID             int64             `json:"id"`
		Metrics        *api.PRMetricsData `json:"metrics"`
	}

	var result []prWithMetrics
	for _, pr := range prs {
		entry := prWithMetrics{
			PRData:      api.PRFromDB(&pr),
			GithubOwner: owner,
			GithubRepo:  repoName,
			ID:          pr.ID,
		}

		m, _ := db.GetPRMetrics(s.store.DB, pr.ID)
		if m != nil {
			metricsData := api.PRMetricsFromDB(m, pr.Number)
			entry.Metrics = &metricsData
		}

		result = append(result, entry)
	}

	if result == nil {
		result = []prWithMetrics{}
	}

	writeJSON(w, http.StatusOK, result)
}

// handleAggregateMetrics returns aggregate metrics for a repo.
func (s *Server) handleAggregateMetrics(w http.ResponseWriter, r *http.Request) {
	repoID, err := parseIntParam(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid repo ID"})
		return
	}

	prs, err := db.GetFinalizedPRsForRepo(s.store.DB, repoID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to get PRs"})
		return
	}

	agg := computeAggregates(s.store.DB, prs)
	writeJSON(w, http.StatusOK, agg)
}

// handleTimeline returns time-series metric data for trend charts.
func (s *Server) handleTimeline(w http.ResponseWriter, r *http.Request) {
	repoID, err := parseIntParam(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid repo ID"})
		return
	}

	prs, err := db.GetFinalizedPRsForRepo(s.store.DB, repoID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to get PRs"})
		return
	}

	type timelinePoint struct {
		PRNumber        int      `json:"pr_number"`
		Title           string   `json:"title"`
		CreatedAt       string   `json:"created_at"`
		PostOpenCommits *int     `json:"post_open_commits"`
		CISuccessRate   *float64 `json:"ci_success_rate"`
		MessagesPerPR   *int     `json:"messages_per_pr"`
		TokenCostUSD    *float64 `json:"token_cost_usd"`
	}

	var result []timelinePoint
	for _, pr := range prs {
		if !pr.CreatedAt.Valid {
			continue
		}
		m, _ := db.GetPRMetrics(s.store.DB, pr.ID)
		if m == nil {
			continue
		}

		point := timelinePoint{
			PRNumber:  pr.Number,
			Title:     pr.Title.String,
			CreatedAt: pr.CreatedAt.String,
		}
		if m.PostOpenCommits.Valid {
			v := int(m.PostOpenCommits.Int64)
			point.PostOpenCommits = &v
		}
		if m.CISuccessRate.Valid {
			v := m.CISuccessRate.Float64 * 100
			point.CISuccessRate = &v
		}
		if m.MessagesPerPR.Valid {
			v := int(m.MessagesPerPR.Int64)
			point.MessagesPerPR = &v
		}
		if m.TokenCostUSD.Valid {
			v := float64(int(m.TokenCostUSD.Float64*100)) / 100
			point.TokenCostUSD = &v
		}

		result = append(result, point)
	}

	if result == nil {
		result = []timelinePoint{}
	}
	writeJSON(w, http.StatusOK, result)
}

// handleWatchStatus returns watch status for all repos.
func (s *Server) handleWatchStatus(w http.ResponseWriter, r *http.Request) {
	watched, err := db.GetAllWatchedRepos(s.store.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to get watch status"})
		return
	}

	type watchStatus struct {
		RepoID              int64  `json:"repo_id"`
		PollIntervalSeconds int    `json:"poll_interval_seconds"`
		LastPolledAt        string `json:"last_polled_at,omitempty"`
		Enabled             bool   `json:"enabled"`
	}

	var result []watchStatus
	for _, w := range watched {
		result = append(result, watchStatus{
			RepoID:              w.RepoID,
			PollIntervalSeconds: w.PollIntervalSeconds,
			LastPolledAt:        w.LastPolledAt.String,
			Enabled:             w.Enabled == 1,
		})
	}

	if result == nil {
		result = []watchStatus{}
	}
	writeJSON(w, http.StatusOK, result)
}

// computeAggregates mirrors the dashboard's getAggregateMetrics logic.
func computeAggregates(database db.DBTX, prs []db.PR) map[string]interface{} {
	var totalPRs int
	var postOpenSum, postOpenCount int
	var acceptedCount, acceptedTotal int
	var ciSum float64
	var ciCount int
	var testYes, testTotal int
	var msgSum, msgCount int
	var iterSum, iterCount int
	var costSum float64
	var costCount int
	var scSum float64
	var scCount int
	var ceSum float64
	var ceCount int

	for _, pr := range prs {
		m, _ := db.GetPRMetrics(database, pr.ID)
		if m == nil {
			continue
		}
		totalPRs++

		if m.PostOpenCommits.Valid {
			postOpenSum += int(m.PostOpenCommits.Int64)
			postOpenCount++
		}
		if m.FirstPassAccepted.Valid {
			acceptedTotal++
			if m.FirstPassAccepted.Int64 == 1 {
				acceptedCount++
			}
		}
		if m.CISuccessRate.Valid {
			ciSum += m.CISuccessRate.Float64
			ciCount++
		}
		if m.HasTests.Valid {
			testTotal++
			if m.HasTests.Int64 == 1 {
				testYes++
			}
		}
		if m.MessagesPerPR.Valid {
			msgSum += int(m.MessagesPerPR.Int64)
			msgCount++
		}
		if m.IterationDepth.Valid {
			iterSum += int(m.IterationDepth.Int64)
			iterCount++
		}
		if m.TokenCostUSD.Valid {
			costSum += m.TokenCostUSD.Float64
			costCount++
		}
		if m.SelfCorrectionRate.Valid {
			scSum += m.SelfCorrectionRate.Float64
			scCount++
		}
		if m.ContextEfficiency.Valid {
			ceSum += m.ContextEfficiency.Float64
			ceCount++
		}
	}

	result := map[string]interface{}{
		"totalPRs": totalPRs,
	}

	if postOpenCount > 0 {
		result["avgPostOpenCommits"] = float64(postOpenSum) / float64(postOpenCount)
	}
	if acceptedTotal > 0 {
		result["firstPassAcceptanceRate"] = float64(acceptedCount) / float64(acceptedTotal)
	}
	if ciCount > 0 {
		result["ciSuccessRate"] = ciSum / float64(ciCount)
	}
	if testTotal > 0 {
		result["testCoverageRate"] = float64(testYes) / float64(testTotal)
	}
	if msgCount > 0 {
		result["avgMessagesPerPR"] = float64(msgSum) / float64(msgCount)
	}
	if iterCount > 0 {
		result["avgIterationDepth"] = float64(iterSum) / float64(iterCount)
	}
	if costCount > 0 {
		result["avgTokenCost"] = costSum / float64(costCount)
		result["totalTokenCost"] = costSum
	}
	if scCount > 0 {
		result["avgSelfCorrectionRate"] = scSum / float64(scCount)
	}
	if ceCount > 0 {
		result["avgContextEfficiency"] = ceSum / float64(ceCount)
	}

	// Unmerged token spend
	repoMetrics, _ := db.GetRepoMetrics(database, 0, "all")
	if len(prs) > 0 {
		repoMetrics, _ = db.GetRepoMetrics(database, prs[0].RepoID, "all")
	}
	if len(repoMetrics) > 0 {
		rm := repoMetrics[0]
		if rm.UnmergedCostUSD > 0 {
			result["unmergedCostUSD"] = rm.UnmergedCostUSD
			result["totalCostUSD"] = rm.TotalCostUSD
			result["unmergedRate"] = rm.UnmergedRate.Float64
		}
	}

	return result
}

// GetRepoByID returns a repo by its database ID.
func GetRepoByID(database db.DBTX, id int64) (*db.Repo, error) {
	var repo db.Repo
	err := database.Get(&repo, "SELECT * FROM repos WHERE id = ?", id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &repo, nil
}
