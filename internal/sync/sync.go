// Package sync orchestrates data ingestion from git, GitHub, and Claude Code
// sessions, computing metrics and storing results in the database.
package sync

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/austinroos/ax/internal/correlator"
	"github.com/austinroos/ax/internal/db"
	"github.com/austinroos/ax/internal/metrics"
	"github.com/austinroos/ax/internal/parsers"
	"github.com/jmoiron/sqlx"
)

// Options controls what gets synced.
type Options struct {
	RepoPath string
	Since    string // YYYY-MM-DD filter
}

// Result contains a summary of what was synced.
type Result struct {
	RepoPath          string
	Owner             string
	Repo              string
	PRsSynced         int
	PRsFailed         int
	SessionsParsed    int
	SessionsCorrelated int
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

	log.Printf("Fetching PRs for %s/%s...", owner, repo)
	prs, err := ghParser.ListPRs("all", 100)
	if err != nil {
		return nil, fmt.Errorf("failed to list PRs: %w", err)
	}

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
		log.Printf("Parsing %d Claude Code session(s)...", len(sessionFiles))
		sessionsByID = make(map[string]*parsers.ParsedSession)
		for _, f := range sessionFiles {
			session, err := parsers.ParseSession(f)
			if err != nil {
				log.Printf("  Warning: failed to parse session %s: %v", filepath.Base(f), err)
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
	}

	// 5. Process each PR
	prFiles := make(map[int][]string)
	prCommits = make(map[int][]parsers.GHCommit)

	// Build PR number → ID mapping for correlator
	prNumberToID := make(map[int]int64)

	for _, ghPR := range prs {
		log.Printf("Processing PR #%d: %s", ghPR.Number, ghPR.Title)

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
		}

		prID, err := db.UpsertPR(database, pr)
		if err != nil {
			log.Printf("  Warning: failed to upsert PR #%d: %v", ghPR.Number, err)
			result.PRsFailed++
			continue
		}
		prNumberToID[ghPR.Number] = prID

		// Compute Phase 1 metrics
		prMetrics := &db.PRMetrics{PRID: prID}

		// -- Post-open commits --
		commits, err := ghParser.GetPRCommits(ghPR.Number)
		if err != nil {
			log.Printf("  Warning: failed to get commits for PR #%d: %v", ghPR.Number, err)
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
			log.Printf("  Warning: failed to get reviews for PR #%d: %v", ghPR.Number, err)
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
			log.Printf("  Warning: failed to get checks for PR #%d: %v", ghPR.Number, err)
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

		// Store metrics (Phase 1 fields set so far)
		db.UpsertPRMetrics(database, prMetrics)

		result.PRsSynced++
	}

	// 6. Correlate sessions to PRs and compute session-dependent metrics
	if len(sessionsByID) > 0 {
		log.Printf("Correlating %d sessions to %d PRs...", len(sessionsByID), len(prs))

		// Build correlation map: PR number → []*ParsedSession
		prSessions := make(map[int][]*parsers.ParsedSession)

		for _, session := range sessionsByID {
			correlations := correlator.CorrelateSession(session, prs, prCommits)
			for _, c := range correlations {
				prID, ok := prNumberToID[c.PRNumber]
				if !ok {
					continue
				}

				// Store correlation
				_, err := database.Exec(`
					INSERT INTO session_prs (session_id, pr_id, confidence)
					VALUES (?, ?, ?)
					ON CONFLICT(session_id, pr_id) DO UPDATE SET confidence = excluded.confidence
				`, c.SessionID, prID, c.Confidence)
				if err != nil {
					log.Printf("  Warning: failed to store correlation %s→PR#%d: %v", c.SessionID[:8], c.PRNumber, err)
				}

				prSessions[c.PRNumber] = append(prSessions[c.PRNumber], session)
				result.SessionsCorrelated++
			}
		}

		// Compute session-dependent metrics per PR
		for prNum, sessions := range prSessions {
			prID, ok := prNumberToID[prNum]
			if !ok {
				continue
			}

			msgCount := metrics.MessagesPerPR(sessions)
			iterDepth := metrics.IterationDepth(sessions)
			selfCorrection := metrics.SelfCorrectionRate(sessions)
			ctxEfficiency := metrics.ContextEfficiency(sessions)
			errorRecovery := metrics.ErrorRecoveryEfficiency(sessions)
			tokenCost := metrics.TokenCostForSessions(sessions)

			// Update PR metrics with session-dependent values
			database.Exec(`
				UPDATE pr_metrics SET
					messages_per_pr = ?,
					iteration_depth = ?,
					self_correction_rate = CASE WHEN ? >= 0 THEN ? ELSE NULL END,
					context_efficiency = CASE WHEN ? >= 0 THEN ? ELSE NULL END,
					error_recovery_attempts = ?,
					token_cost_usd = ?
				WHERE pr_id = ?
			`, msgCount, iterDepth,
				selfCorrection, selfCorrection,
				ctxEfficiency, ctxEfficiency,
				errorRecovery,
				tokenCost,
				prID)
		}
	}

	// 7. Line revisit rates
	revisits := metrics.CalculateLineRevisits(prFiles)
	if len(revisits) > 0 {
		log.Printf("Found %d files modified across multiple PRs", len(revisits))
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

	// 8. Update sync timestamp
	db.UpdateRepoSyncTime(database, repoID)

	return result, nil
}

func defaultClaudeDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude")
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
