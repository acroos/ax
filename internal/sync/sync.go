// Package sync orchestrates data ingestion from git, GitHub, and Claude Code
// sessions, computing metrics and storing results in the database.
package sync

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/correlator"
	"github.com/austinroos/ax/internal/db"
	"github.com/austinroos/ax/internal/metrics"
	"github.com/austinroos/ax/internal/parsers"
	"github.com/austinroos/ax/internal/ui"
	"github.com/jmoiron/sqlx"
)

// Options controls what gets synced.
type Options struct {
	RepoPath     string
	Since        string // YYYY-MM-DD filter
	SessionsOnly bool   // skip GitHub API calls, only re-parse sessions
}

// Result contains a summary of what was synced.
type Result struct {
	RepoPath           string
	Owner              string
	Repo               string
	PRsSynced          int
	PRsFailed          int
	PRsFinalized       int
	PRsSkipped         int // already finalized
	PRsOpen            int
	SessionsParsed     int
	SessionsCorrelated int
	PlansAnalyzed      int
	UnmergedCostUSD    float64
	TotalCostUSD       float64
	UnmergedRate       float64
}

// Run performs a full sync for a repository: fetches git + GitHub data,
// parses Claude Code sessions, correlates sessions to PRs, and computes all metrics.
func Run(database *sqlx.DB, opts Options) (*Result, error) {
	result := &Result{RepoPath: opts.RepoPath}

	// 1. Parse git repo metadata
	gitParser := parsers.NewGitParser(opts.RepoPath)

	repoRoot, err := gitParser.RepoRoot()
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}
	result.RepoPath = repoRoot

	remoteURL, err := gitParser.RemoteURL()
	if err != nil {
		return nil, fmt.Errorf("failed to get remote URL: %w", err)
	}

	owner, repo, err := parsers.ParseGitHubRemote(remoteURL)
	if err != nil {
		return nil, fmt.Errorf("could not parse GitHub remote: %w", err)
	}
	result.Owner = owner
	result.Repo = repo

	// 2. Upsert repo in database
	repoID, err := db.UpsertRepo(database, repoRoot, remoteURL, owner, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert repo: %w", err)
	}

	// 3. Fetch PRs from GitHub
	ghParser := parsers.NewGitHubParser(owner, repo)

	sp := ui.NewSpinner("Fetching PRs from GitHub...")
	prs, err := ghParser.ListPRs("all", 100)
	if err != nil {
		sp.StopFail("Failed to fetch PRs")
		return nil, fmt.Errorf("failed to list PRs: %w", err)
	}
	sp.Stop(fmt.Sprintf("Fetched %d PRs from GitHub", len(prs)))

	defaultBranch, err := gitParser.DefaultBranch()
	if err != nil {
		defaultBranch = "main"
	}

	// 4. Parse Claude Code sessions for this project
	claudeDir := defaultClaudeDir()
	var sessionsByID map[string]*parsers.ParsedSession
	var prCommits map[int][]parsers.GHCommit // needed for correlator

	sessionFiles, _ := parsers.FindSessionFiles(claudeDir, repoRoot)
	if len(sessionFiles) > 0 {
		sp = ui.NewSpinner(fmt.Sprintf("Parsing %d Claude Code sessions...", len(sessionFiles)))
		sessionsByID = make(map[string]*parsers.ParsedSession)
		for _, f := range sessionFiles {
			session, err := parsers.ParseSession(f)
			if err != nil {
				ui.Warnf("failed to parse session %s: %v", filepath.Base(f), err)
				continue
			}
			session.Project = repoRoot
			sessionsByID[session.ID] = session
			result.SessionsParsed++

			// Store session in database
			dbSession := &db.Session{
				ID:                       session.ID,
				RepoID:                   sql.NullInt64{Int64: repoID, Valid: true},
				Branch:                   sql.NullString{String: session.Branch, Valid: session.Branch != ""},
				StartedAt:                sql.NullInt64{Int64: session.StartedAt, Valid: session.StartedAt > 0},
				EndedAt:                  sql.NullInt64{Int64: session.EndedAt, Valid: session.EndedAt > 0},
				MessageCount:             session.HumanMessages,
				TurnCount:                session.TurnCount,
				InputTokens:              session.InputTokens,
				OutputTokens:             session.OutputTokens,
				CacheCreationInputTokens: session.CacheCreationInputTokens,
				CacheReadInputTokens:     session.CacheReadInputTokens,
				TotalCostUSD:             sql.NullFloat64{Float64: session.TotalCostUSD, Valid: true},
				PrimaryModel:             sql.NullString{String: session.PrimaryModel, Valid: session.PrimaryModel != ""},
			}
			database.Exec(`
				INSERT INTO sessions (id, repo_id, branch, started_at, ended_at, message_count, turn_count,
					input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
					total_cost_usd, primary_model)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
					primary_model = excluded.primary_model
			`, dbSession.ID, dbSession.RepoID, dbSession.Branch,
				dbSession.StartedAt, dbSession.EndedAt,
				dbSession.MessageCount, dbSession.TurnCount,
				dbSession.InputTokens, dbSession.OutputTokens,
				dbSession.CacheCreationInputTokens, dbSession.CacheReadInputTokens,
				dbSession.TotalCostUSD, dbSession.PrimaryModel)
		}
		sp.Stop(fmt.Sprintf("Parsed %d Claude Code sessions", result.SessionsParsed))
	}

	// 5. Process each PR
	prFiles := make(map[int][]string)
	prCommits = make(map[int][]parsers.GHCommit)

	// Build PR number → ID mapping for correlator
	prNumberToID := make(map[int]int64)

	sp = ui.NewSpinner(fmt.Sprintf("Processing %d PRs...", len(prs)))
	for _, ghPR := range prs {

		state := strings.ToLower(ghPR.State)

		pr := &db.PR{
			RepoID:       repoID,
			Number:       ghPR.Number,
			Title:        sql.NullString{String: ghPR.Title, Valid: true},
			Branch:       sql.NullString{String: ghPR.HeadRefName, Valid: ghPR.HeadRefName != ""},
			State:        sql.NullString{String: state, Valid: true},
			CreatedAt:    sql.NullString{String: ghPR.CreatedAt, Valid: ghPR.CreatedAt != ""},
			MergedAt:     sql.NullString{String: ghPR.MergedAt, Valid: ghPR.MergedAt != ""},
			ClosedAt:     sql.NullString{String: ghPR.ClosedAt, Valid: ghPR.ClosedAt != ""},
			URL:          sql.NullString{String: ghPR.URL, Valid: ghPR.URL != ""},
			Additions:    ghPR.Additions,
			Deletions:    ghPR.Deletions,
			ChangedFiles: ghPR.ChangedFiles,
			Author:       sql.NullString{String: ghPR.Author.Login, Valid: ghPR.Author.Login != ""},
		}

		prID, err := db.UpsertPR(database, pr)
		if err != nil {
			ui.Warnf("failed to upsert PR #%d: %v", ghPR.Number, err)
			result.PRsFailed++
			continue
		}
		prNumberToID[ghPR.Number] = prID

		// Skip metric computation for already-finalized PRs
		finalized, _ := db.IsPRFinalized(database, prID)
		if finalized {
			result.PRsSkipped++
			result.PRsSynced++
			continue
		}

		// Skip metric computation for open (non-terminal) PRs
		if !IsTerminalState(state) {
			result.PRsOpen++
			// Still fetch commits for correlation purposes
			commits, err := ghParser.GetPRCommits(ghPR.Number)
			if err == nil {
				prCommits[ghPR.Number] = commits
			}
			result.PRsSynced++
			continue
		}

		// Compute Phase 1 metrics for terminal PRs
		prMetrics := &db.PRMetrics{PRID: prID}

		// -- Post-open commits --
		commits, err := ghParser.GetPRCommits(ghPR.Number)
		if err != nil {
			ui.Warnf("failed to get commits for PR #%d: %v", ghPR.Number, err)
		} else {
			prCommits[ghPR.Number] = commits
			postOpen := metrics.PostOpenCommits(commits, ghPR.CreatedAt)
			prMetrics.PostOpenCommits = sql.NullInt64{Int64: int64(postOpen), Valid: true}

			for _, c := range commits {
				files, err := gitParser.FilesChangedInCommit(c.SHA)
				if err == nil {
					prFiles[ghPR.Number] = append(prFiles[ghPR.Number], files...)
				}
			}
		}

		// -- First-pass acceptance --
		reviews, err := ghParser.GetPRReviews(ghPR.Number)
		if err != nil {
			ui.Warnf("failed to get reviews for PR #%d: %v", ghPR.Number, err)
		} else {
			accepted := metrics.FirstPassAccepted(reviews)
			val := int64(0)
			if accepted {
				val = 1
			}
			prMetrics.FirstPassAccepted = sql.NullInt64{Int64: val, Valid: true}
		}

		// -- CI success rate --
		checks, err := ghParser.GetPRChecks(ghPR.Number)
		if err != nil {
			ui.Warnf("failed to get checks for PR #%d: %v", ghPR.Number, err)
		} else {
			rate := metrics.CISuccessRate(checks)
			if rate >= 0 {
				prMetrics.CISuccessRate = sql.NullFloat64{Float64: rate, Valid: true}
			}
		}

		// -- Test coverage --
		if files, ok := prFiles[ghPR.Number]; ok {
			hasTests := metrics.HasTestFiles(files)
			val := int64(0)
			if hasTests {
				val = 1
			}
			prMetrics.HasTests = sql.NullInt64{Int64: val, Valid: true}
		}

		// -- Diff churn --
		if ghPR.HeadRefName != "" && state == "merged" {
			branchCommits, err := gitParser.CommitsOnBranch(ghPR.HeadRefName, defaultBranch)
			if err == nil && len(branchCommits) > 0 {
				totalAdded := 0
				for _, c := range branchCommits {
					totalAdded += c.Additions
				}
				netStats, err := gitParser.DiffStatBetween(defaultBranch, ghPR.HeadRefName)
				if err == nil {
					netAdded := 0
					for _, s := range netStats {
						netAdded += s.Additions
					}
					churn := metrics.DiffChurn(totalAdded, netAdded)
					prMetrics.DiffChurnLines = sql.NullInt64{Int64: int64(churn), Valid: true}
				}
			}
		}

		// Store commits
		if commits != nil {
			for _, c := range commits {
				authorName := ""
				if len(c.Authors) > 0 {
					authorName = c.Authors[0].Name
				}
				isClaude := strings.Contains(c.MessageBody, "Co-Authored-By") &&
					strings.Contains(strings.ToLower(c.MessageBody), "claude")
				isPostOpen := c.CommittedDate > ghPR.CreatedAt

				commit := &db.Commit{
					SHA:              c.SHA,
					RepoID:           repoID,
					PRID:             sql.NullInt64{Int64: prID, Valid: true},
					Message:          sql.NullString{String: c.MessageHeadline, Valid: true},
					Author:           sql.NullString{String: authorName, Valid: authorName != ""},
					CommittedAt:      sql.NullString{String: c.CommittedDate, Valid: c.CommittedDate != ""},
					IsClaudeAuthored: boolToInt(isClaude),
					IsPostOpen:       boolToInt(isPostOpen),
				}
				db.UpsertCommit(database, commit)
			}
		}

		// Save Phase 1 metrics (finalization deferred until after session correlation)
		db.UpsertPRMetrics(database, prMetrics)

		result.PRsSynced++
	}
	sp.Stop(fmt.Sprintf("Processed %d PRs", result.PRsSynced))

	// 6. Correlate sessions to PRs and compute session-dependent metrics
	var prSessions map[int][]*parsers.ParsedSession
	if len(sessionsByID) > 0 {
		sp = ui.NewSpinner("Correlating sessions to PRs...")

		// First pass: correlate all sessions and count how many PRs each session maps to
		sessionCorrelations := make(map[string][]correlator.Correlation) // session ID → correlations
		for _, session := range sessionsByID {
			correlations := correlator.CorrelateSession(session, prs, prCommits)
			if len(correlations) > 0 {
				sessionCorrelations[session.ID] = correlations
			}
		}

		// Count PRs per session (for dividing metrics evenly)
		sessionPRCount := make(map[string]int)
		for sessionID, correlations := range sessionCorrelations {
			sessionPRCount[sessionID] = len(correlations)
		}

		// Second pass: store correlations and build PR → sessions map
		prSessions = make(map[int][]*parsers.ParsedSession)
		for sessionID, correlations := range sessionCorrelations {
			for _, c := range correlations {
				prID, ok := prNumberToID[c.PRNumber]
				if !ok {
					continue
				}

				_, err := database.Exec(`
					INSERT INTO session_prs (session_id, pr_id, confidence)
					VALUES (?, ?, ?)
					ON CONFLICT(session_id, pr_id) DO UPDATE SET confidence = excluded.confidence
				`, c.SessionID, prID, c.Confidence)
				if err != nil {
					ui.Warnf("failed to store correlation %s→PR#%d: %v", c.SessionID[:8], c.PRNumber, err)
				}

				prSessions[c.PRNumber] = append(prSessions[c.PRNumber], sessionsByID[sessionID])
				result.SessionsCorrelated++
			}
		}

		// Compute session-dependent metrics per PR
		// When a session correlates to N PRs, its metrics are divided by N
		for prNum, sessions := range prSessions {
			prID, ok := prNumberToID[prNum]
			if !ok {
				continue
			}

			// Load existing metrics to update with session data
			existing, _ := db.GetPRMetrics(database, prID)
			if existing == nil {
				existing = &db.PRMetrics{PRID: prID}
			}

			ComputeSessionMetricsForPR(sessions, sessionPRCount, existing)
			db.UpsertPRMetrics(database, existing)
		}
		sp.Stop(fmt.Sprintf("Correlated %d sessions", result.SessionsCorrelated))
	}

	// 7. Line revisit rates (skip finalized PRs)
	revisits := metrics.CalculateLineRevisits(prFiles)
	if len(revisits) > 0 {
		// Line revisit analysis
		for prNum, files := range prFiles {
			revisitCount := 0
			for _, f := range files {
				for _, r := range revisits {
					if r.File == f {
						revisitCount += r.RevisitCount
						break
					}
				}
			}
			if revisitCount > 0 && len(files) > 0 {
				rate := float64(revisitCount) / float64(len(files))
				if prID, ok := prNumberToID[prNum]; ok {
					database.Exec("UPDATE pr_metrics SET line_revisit_rate = ? WHERE pr_id = ?", rate, prID)
				}
			}
		}
	}

	// 8. Plan analysis — compare plan files to actual PR diffs
	if len(sessionsByID) > 0 && prSessions != nil {
		for prNum, sessions := range prSessions {
			prID, ok := prNumberToID[prNum]
			if !ok {
				continue
			}

			// Find plan files from correlated sessions
			for _, session := range sessions {
				planPaths := parsers.FindPlanFilesForSession(session, repoRoot)
				for _, planPath := range planPaths {
					plan, err := parsers.ParsePlanFile(planPath)
					if err != nil || len(plan.PlannedFiles) == 0 {
						continue
					}

					// Get actual files changed in this PR
					actualFiles := prFiles[prNum]
					if len(actualFiles) == 0 {
						continue
					}

					// Compare plan to implementation
					comparison := metrics.ComparePlanToImplementation(plan.PlannedFiles, actualFiles)
					result.PlansAnalyzed++

					// Store plan analysis
					scopeCreep := 0
					if comparison.ScopeCreep {
						scopeCreep = 1
					}
					database.Exec(`
						INSERT INTO plan_analyses (pr_id, plan_file, coverage_score, deviation_score, scope_creep_detected,
							planned_files, actual_files)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`, prID, planPath, comparison.CoverageScore, comparison.DeviationScore, scopeCreep,
						strings.Join(comparison.PlannedFiles, "\n"), strings.Join(comparison.ActualFiles, "\n"))

					// Update pr_metrics with plan scores
					database.Exec(`
						UPDATE pr_metrics SET
							plan_coverage_score = ?,
							plan_deviation_score = ?,
							scope_creep_detected = ?
						WHERE pr_id = ?
					`, comparison.CoverageScore, comparison.DeviationScore, scopeCreep, prID)

					break // Use the first plan file found per session
				}
			}
		}
	}

	// 9. Finalize all terminal PRs (after all metrics are computed)
	sp = ui.NewSpinner("Finalizing metrics...")
	for _, ghPR := range prs {
		state := strings.ToLower(ghPR.State)
		if !IsTerminalState(state) {
			continue
		}
		prID, ok := prNumberToID[ghPR.Number]
		if !ok {
			continue
		}
		finalized, _ := db.IsPRFinalized(database, prID)
		if finalized {
			continue
		}
		existing, _ := db.GetPRMetrics(database, prID)
		if existing == nil {
			existing = &db.PRMetrics{PRID: prID}
		}
		if err := FinalizePR(database, prID, existing); err != nil {
			ui.Warnf("failed to finalize PR #%d: %v", ghPR.Number, err)
		} else {
			result.PRsFinalized++
		}
	}
	if result.PRsFinalized > 0 {
		sp.Stop(fmt.Sprintf("Finalized %d PRs", result.PRsFinalized))
	} else {
		sp.Stop("All PRs up to date")
	}

	// 10. Compute unmerged token spend (repo-level metric)
	if len(sessionsByID) > 0 {
		computeUnmergedTokenSpend(database, repoID, sessionsByID, result)
	}

	// 11. Auto-register repo as watched (if not already)
	db.UpsertWatchedRepo(database, &db.WatchedRepo{
		RepoID:              repoID,
		PollIntervalSeconds: 300,
		Enabled:             1,
	})

	// 12. Update sync timestamp
	db.UpdateRepoSyncTime(database, repoID)

	return result, nil
}

// computeUnmergedTokenSpend calculates how much token cost went to work
// that never shipped: sessions correlated to closed-not-merged PRs or
// sessions not correlated to any PR at all.
func computeUnmergedTokenSpend(database *sqlx.DB, repoID int64, sessionsByID map[string]*parsers.ParsedSession, result *Result) {
	// Get all session IDs that are correlated to merged PRs
	var mergedSessionIDs []string
	database.Select(&mergedSessionIDs, `
		SELECT DISTINCT sp.session_id
		FROM session_prs sp
		JOIN prs p ON sp.pr_id = p.id
		WHERE p.repo_id = ? AND LOWER(p.state) = 'merged'
	`, repoID)
	mergedSet := make(map[string]bool)
	for _, id := range mergedSessionIDs {
		mergedSet[id] = true
	}

	// Get session IDs correlated to open PRs (exclude from waste calc)
	var openSessionIDs []string
	database.Select(&openSessionIDs, `
		SELECT DISTINCT sp.session_id
		FROM session_prs sp
		JOIN prs p ON sp.pr_id = p.id
		WHERE p.repo_id = ? AND LOWER(p.state) = 'open'
	`, repoID)
	openSet := make(map[string]bool)
	for _, id := range openSessionIDs {
		openSet[id] = true
	}

	var totalCost, unmergedCost float64
	var totalTokens, unmergedTokens int
	var totalSessions int

	for _, session := range sessionsByID {
		if session.TotalCostUSD == 0 {
			continue
		}
		totalSessions++
		totalCost += session.TotalCostUSD
		sessionTokens := session.InputTokens + session.OutputTokens +
			session.CacheCreationInputTokens + session.CacheReadInputTokens
		totalTokens += sessionTokens

		// Skip sessions tied to open PRs (in-progress, not waste)
		if openSet[session.ID] {
			continue
		}

		// If not correlated to any merged PR, it's unmerged spend
		if !mergedSet[session.ID] {
			unmergedCost += session.TotalCostUSD
			unmergedTokens += sessionTokens
		}
	}

	if totalSessions == 0 {
		return
	}

	var unmergedRate float64
	if totalCost > 0 {
		unmergedRate = unmergedCost / totalCost
	}

	rm := &db.RepoMetrics{
		RepoID:         repoID,
		PeriodStart:    "all",
		PeriodEnd:      "all",
		PeriodType:     "all",
		TotalSessions:  totalSessions,
		TotalTokens:    totalTokens,
		TotalCostUSD:   totalCost,
		UnmergedTokens: unmergedTokens,
		UnmergedCostUSD: unmergedCost,
		UnmergedRate:   sql.NullFloat64{Float64: unmergedRate, Valid: true},
	}
	db.UpsertRepoMetrics(database, rm)

	if result != nil {
		result.TotalCostUSD = totalCost
		result.UnmergedCostUSD = unmergedCost
		result.UnmergedRate = unmergedRate
	}
}

func defaultClaudeDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude")
}

// RunSessionsOnly performs a lightweight sync that only re-parses Claude Code
// sessions and updates session-dependent metrics for existing PRs.
// It skips all GitHub API calls, making it fast enough to run mid-session.
func RunSessionsOnly(database *sqlx.DB, opts Options) (*Result, error) {
	result := &Result{RepoPath: opts.RepoPath}

	gitParser := parsers.NewGitParser(opts.RepoPath)
	repoRoot, err := gitParser.RepoRoot()
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}
	result.RepoPath = repoRoot

	// Look up existing repo in database
	repo, err := db.GetRepoByPath(database, repoRoot)
	if err != nil || repo == nil {
		// Repo not synced yet — silently return so hooks don't error
		return result, nil
	}
	result.Owner = repo.GithubOwner.String
	result.Repo = repo.GithubRepo.String

	// Parse sessions
	claudeDir := defaultClaudeDir()
	sessionFiles, _ := parsers.FindSessionFiles(claudeDir, repoRoot)
	if len(sessionFiles) == 0 {
		return result, nil
	}

	sp := ui.NewSpinner(fmt.Sprintf("Parsing %d Claude Code sessions...", len(sessionFiles)))

	sessionsByID := make(map[string]*parsers.ParsedSession)
	for _, f := range sessionFiles {
		session, err := parsers.ParseSession(f)
		if err != nil {
			continue
		}
		session.Project = repoRoot
		sessionsByID[session.ID] = session
		result.SessionsParsed++

		// Store session in database
		database.Exec(`
			INSERT INTO sessions (id, repo_id, branch, started_at, ended_at, message_count, turn_count,
				input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
				total_cost_usd, primary_model)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				message_count = excluded.message_count,
				turn_count = excluded.turn_count,
				input_tokens = excluded.input_tokens,
				output_tokens = excluded.output_tokens,
				cache_creation_input_tokens = excluded.cache_creation_input_tokens,
				cache_read_input_tokens = excluded.cache_read_input_tokens,
				total_cost_usd = excluded.total_cost_usd,
				primary_model = excluded.primary_model
		`, session.ID, repo.ID, session.Branch,
			session.StartedAt, session.EndedAt,
			session.HumanMessages, session.TurnCount,
			session.InputTokens, session.OutputTokens,
			session.CacheCreationInputTokens, session.CacheReadInputTokens,
			session.TotalCostUSD, session.PrimaryModel)
	}
	sp.Stop(fmt.Sprintf("Parsed %d sessions", result.SessionsParsed))

	// Load existing PRs from database for correlation
	existingPRs, err := db.GetPRsForRepo(database, repo.ID)
	if err != nil || len(existingPRs) == 0 {
		return result, nil
	}

	// Convert to GHPullRequest format for the correlator
	var ghPRs []parsers.GHPullRequest
	prNumberToID := make(map[int]int64)
	for _, pr := range existingPRs {
		ghPRs = append(ghPRs, parsers.GHPullRequest{
			Number:      pr.Number,
			HeadRefName: pr.Branch.String,
			URL:         pr.URL.String,
			CreatedAt:   pr.CreatedAt.String,
		})
		prNumberToID[pr.Number] = pr.ID
	}

	// Correlate and compute session metrics (same logic as full sync)
	sessionCorrelations := make(map[string][]correlator.Correlation)
	for _, session := range sessionsByID {
		correlations := correlator.CorrelateSession(session, ghPRs, nil)
		if len(correlations) > 0 {
			sessionCorrelations[session.ID] = correlations
		}
	}

	sessionPRCount := make(map[string]int)
	for sessionID, correlations := range sessionCorrelations {
		sessionPRCount[sessionID] = len(correlations)
	}

	prSessions := make(map[int][]*parsers.ParsedSession)
	for sessionID, correlations := range sessionCorrelations {
		for _, c := range correlations {
			prID, ok := prNumberToID[c.PRNumber]
			if !ok {
				continue
			}
			database.Exec(`
				INSERT INTO session_prs (session_id, pr_id, confidence)
				VALUES (?, ?, ?)
				ON CONFLICT(session_id, pr_id) DO UPDATE SET confidence = excluded.confidence
			`, c.SessionID, prID, c.Confidence)
			prSessions[c.PRNumber] = append(prSessions[c.PRNumber], sessionsByID[sessionID])
			result.SessionsCorrelated++
		}
	}

	for prNum, sessions := range prSessions {
		prID, ok := prNumberToID[prNum]
		if !ok {
			continue
		}

		var weightedMessages, weightedIterations, weightedCost, weightedErrors float64
		for _, s := range sessions {
			weight := 1.0 / float64(sessionPRCount[s.ID])
			weightedMessages += float64(s.HumanMessages) * weight
			weightedIterations += float64(s.TurnCount) * weight
			weightedCost += s.TotalCostUSD * weight
			weightedErrors += float64(s.BashErrors) * weight
		}

		database.Exec(`
			UPDATE pr_metrics SET
				messages_per_pr = ?,
				iteration_depth = ?,
				self_correction_rate = CASE WHEN ? >= 0 THEN ? ELSE NULL END,
				context_efficiency = CASE WHEN ? >= 0 THEN ? ELSE NULL END,
				error_recovery_attempts = ?,
				token_cost_usd = ?
			WHERE pr_id = ?
		`, int(weightedMessages+0.5), int(weightedIterations+0.5),
			metrics.SelfCorrectionRate(sessions), metrics.SelfCorrectionRate(sessions),
			metrics.ContextEfficiency(sessions), metrics.ContextEfficiency(sessions),
			int(weightedErrors+0.5),
			weightedCost,
			prID)
	}

	return result, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
