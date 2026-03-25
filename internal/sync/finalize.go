package sync

import (
	"database/sql"
	"log"
	"strings"

	"github.com/austinroos/ax/internal/db"
	"github.com/austinroos/ax/internal/metrics"
	"github.com/austinroos/ax/internal/parsers"
	"github.com/jmoiron/sqlx"
)

// IsTerminalState returns true if the PR state indicates it is no longer in-flight.
func IsTerminalState(state string) bool {
	s := strings.ToLower(state)
	return s == "merged" || s == "closed"
}

// FinalizePR computes all metrics for a terminal PR and marks them as finalized.
// It takes the pre-computed Phase 1 metrics, session data, and plan data to produce
// the final metric snapshot. Returns true if the PR was finalized.
func FinalizePR(database *sqlx.DB, prID int64, m *db.PRMetrics) error {
	m.MetricsFinalized = 1
	m.FinalizedAt = sql.NullString{String: "now", Valid: true}

	// Use a direct SQL update to set finalized_at = CURRENT_TIMESTAMP
	_, err := database.Exec(`
		INSERT INTO pr_metrics (pr_id, messages_per_pr, iteration_depth, post_open_commits, first_pass_accepted,
			ci_success_rate, diff_churn_lines, has_tests, line_revisit_rate, plan_coverage_score,
			plan_deviation_score, scope_creep_detected, self_correction_rate, context_efficiency,
			error_recovery_attempts, token_cost_usd, metrics_finalized, finalized_at, computed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(pr_id) DO UPDATE SET
			messages_per_pr = excluded.messages_per_pr,
			iteration_depth = excluded.iteration_depth,
			post_open_commits = excluded.post_open_commits,
			first_pass_accepted = excluded.first_pass_accepted,
			ci_success_rate = excluded.ci_success_rate,
			diff_churn_lines = excluded.diff_churn_lines,
			has_tests = excluded.has_tests,
			line_revisit_rate = excluded.line_revisit_rate,
			plan_coverage_score = excluded.plan_coverage_score,
			plan_deviation_score = excluded.plan_deviation_score,
			scope_creep_detected = excluded.scope_creep_detected,
			self_correction_rate = excluded.self_correction_rate,
			context_efficiency = excluded.context_efficiency,
			error_recovery_attempts = excluded.error_recovery_attempts,
			token_cost_usd = excluded.token_cost_usd,
			metrics_finalized = 1,
			finalized_at = CURRENT_TIMESTAMP,
			computed_at = CURRENT_TIMESTAMP
	`, prID, m.MessagesPerPR, m.IterationDepth, m.PostOpenCommits, m.FirstPassAccepted,
		m.CISuccessRate, m.DiffChurnLines, m.HasTests, m.LineRevisitRate,
		m.PlanCoverageScore, m.PlanDeviationScore, m.ScopeCreepDetected,
		m.SelfCorrectionRate, m.ContextEfficiency, m.ErrorRecoveryAttempts, m.TokenCostUSD)
	if err != nil {
		return err
	}

	return nil
}

// ComputeSessionMetricsForPR computes session-dependent metrics for a PR and applies them
// to the given PRMetrics struct. This is shared between full sync and finalization paths.
func ComputeSessionMetricsForPR(sessions []*parsers.ParsedSession, sessionPRCount map[string]int, m *db.PRMetrics) {
	if len(sessions) == 0 {
		return
	}

	var weightedMessages, weightedIterations, weightedCost, weightedErrors float64
	for _, s := range sessions {
		weight := 1.0 / float64(sessionPRCount[s.ID])
		weightedMessages += float64(s.HumanMessages) * weight
		weightedIterations += float64(s.TurnCount) * weight
		weightedCost += s.TotalCostUSD * weight
		weightedErrors += float64(s.BashErrors) * weight
	}

	m.MessagesPerPR = sql.NullInt64{Int64: int64(weightedMessages + 0.5), Valid: true}
	m.IterationDepth = sql.NullInt64{Int64: int64(weightedIterations + 0.5), Valid: true}
	m.TokenCostUSD = sql.NullFloat64{Float64: weightedCost, Valid: true}
	m.ErrorRecoveryAttempts = sql.NullInt64{Int64: int64(weightedErrors + 0.5), Valid: true}

	selfCorrection := metrics.SelfCorrectionRate(sessions)
	if selfCorrection >= 0 {
		m.SelfCorrectionRate = sql.NullFloat64{Float64: selfCorrection, Valid: true}
	}

	ctxEfficiency := metrics.ContextEfficiency(sessions)
	if ctxEfficiency >= 0 {
		m.ContextEfficiency = sql.NullFloat64{Float64: ctxEfficiency, Valid: true}
	}
}

// MaybeFinalizePR checks if a PR is in a terminal state and, if so,
// finalizes its metrics. Returns true if the PR was finalized.
func MaybeFinalizePR(database *sqlx.DB, prID int64, state string) bool {
	if !IsTerminalState(state) {
		return false
	}

	finalized, err := db.IsPRFinalized(database, prID)
	if err != nil {
		log.Printf("  Warning: failed to check finalization for PR %d: %v", prID, err)
		return false
	}
	if finalized {
		return false // already done
	}

	// Load existing metrics and mark as finalized
	existing, err := db.GetPRMetrics(database, prID)
	if err != nil || existing == nil {
		return false
	}

	if err := FinalizePR(database, prID, existing); err != nil {
		log.Printf("  Warning: failed to finalize PR %d: %v", prID, err)
		return false
	}

	return true
}
