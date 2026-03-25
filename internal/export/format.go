package export

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"golang.org/x/term"
)

// WriteJSON writes rows as a JSON array.
// Pretty-prints when writing to a TTY, compact when piped.
func WriteJSON(w io.Writer, rows interface{}) error {
	enc := json.NewEncoder(w)
	if f, ok := w.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		enc.SetIndent("", "  ")
	}
	return enc.Encode(rows)
}

// WriteJSONL writes rows as newline-delimited JSON (one object per line).
func WriteJSONL(w io.Writer, rows []Row) error {
	for _, row := range rows {
		data, err := json.Marshal(row)
		if err != nil {
			return err
		}
		if _, err := w.Write(data); err != nil {
			return err
		}
		if _, err := w.Write([]byte("\n")); err != nil {
			return err
		}
	}
	return nil
}

// WriteJSONLAggregates writes aggregate rows as JSONL.
func WriteJSONLAggregates(w io.Writer, rows []AggregateRow) error {
	for _, row := range rows {
		data, err := json.Marshal(row)
		if err != nil {
			return err
		}
		if _, err := w.Write(data); err != nil {
			return err
		}
		if _, err := w.Write([]byte("\n")); err != nil {
			return err
		}
	}
	return nil
}

// WriteCSV writes rows as CSV with a header row.
func WriteCSV(w io.Writer, rows []Row) error {
	cw := csv.NewWriter(w)
	defer cw.Flush()

	// Header
	header := []string{
		"repo", "pr_number", "title", "state", "created_at", "merged_at",
		"additions", "deletions", "changed_files",
		"post_open_commits", "first_pass_accepted", "ci_success_rate",
		"has_tests", "diff_churn_lines", "line_revisit_rate",
		"messages_per_pr", "iteration_depth", "self_correction_rate",
		"context_efficiency", "error_recovery_attempts", "token_cost_usd",
		"plan_coverage_score", "plan_deviation_score", "scope_creep_detected",
	}
	if err := cw.Write(header); err != nil {
		return err
	}

	for _, row := range rows {
		record := []string{
			row.Repo,
			fmt.Sprintf("%d", row.PRNumber),
			row.Title,
			row.State,
			row.CreatedAt,
			row.MergedAt,
			fmt.Sprintf("%d", row.Additions),
			fmt.Sprintf("%d", row.Deletions),
			fmt.Sprintf("%d", row.ChangedFiles),
			optInt(row.Metrics.PostOpenCommits),
			optBool(row.Metrics.FirstPassAccepted),
			optFloat(row.Metrics.CISuccessRate),
			optBool(row.Metrics.HasTests),
			optInt(row.Metrics.DiffChurnLines),
			optFloat(row.Metrics.LineRevisitRate),
			optInt(row.Metrics.MessagesPerPR),
			optInt(row.Metrics.IterationDepth),
			optFloat(row.Metrics.SelfCorrectionRate),
			optFloat(row.Metrics.ContextEfficiency),
			optInt(row.Metrics.ErrorRecoveryAttempts),
			optFloat(row.Metrics.TokenCostUSD),
			optFloat(row.Metrics.PlanCoverageScore),
			optFloat(row.Metrics.PlanDeviationScore),
			optBool(row.Metrics.ScopeCreepDetected),
		}
		if err := cw.Write(record); err != nil {
			return err
		}
	}

	return nil
}

// WriteCSVAggregates writes aggregate rows as CSV.
func WriteCSVAggregates(w io.Writer, rows []AggregateRow) error {
	cw := csv.NewWriter(w)
	defer cw.Flush()

	header := []string{
		"repo", "total_sessions", "total_tokens", "total_cost_usd",
		"unmerged_tokens", "unmerged_cost_usd", "unmerged_rate",
	}
	if err := cw.Write(header); err != nil {
		return err
	}

	for _, row := range rows {
		record := []string{
			row.Repo,
			fmt.Sprintf("%d", row.TotalSessions),
			fmt.Sprintf("%d", row.TotalTokens),
			fmt.Sprintf("%.2f", row.TotalCostUSD),
			fmt.Sprintf("%d", row.UnmergedTokens),
			fmt.Sprintf("%.2f", row.UnmergedCostUSD),
			fmt.Sprintf("%.4f", row.UnmergedRate),
		}
		if err := cw.Write(record); err != nil {
			return err
		}
	}

	return nil
}

func optInt(v *int) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%d", *v)
}

func optFloat(v *float64) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%.4f", *v)
}

func optBool(v *bool) string {
	if v == nil {
		return ""
	}
	if *v {
		return "true"
	}
	return "false"
}
