// Package main is the entry point for the ax CLI.
// ax measures developer experience for agentic coding workflows.
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"text/tabwriter"

	"github.com/austinroos/ax/internal/db"
	axsync "github.com/austinroos/ax/internal/sync"
	"github.com/jmoiron/sqlx"
	"github.com/spf13/cobra"
)

// version is set at build time via ldflags.
var version = "dev"

func main() {
	root := &cobra.Command{
		Use:   "ax",
		Short: "Agentic coding DX metrics",
		Long:  "ax measures developer experience for agentic coding workflows.\nIt analyzes git history, GitHub PR data, and Claude Code session data\nto surface actionable metrics about how effectively you work with AI coding agents.",
		Version: version,
	}

	root.AddCommand(newSyncCmd())
	root.AddCommand(newReportCmd())
	root.AddCommand(newStatusCmd())
	root.AddCommand(newDashboardCmd())

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// openDB opens the ax database, creating it if needed.
func openDB() (*sqlx.DB, error) {
	dbPath, err := db.DefaultDBPath()
	if err != nil {
		return nil, err
	}
	return db.Open(dbPath)
}

// resolveRepoPath returns the repo path, defaulting to cwd.
func resolveRepoPath(flagValue string) (string, error) {
	if flagValue != "" {
		return filepath.Abs(flagValue)
	}
	return os.Getwd()
}

func newSyncCmd() *cobra.Command {
	var repoPath string
	var since string

	cmd := &cobra.Command{
		Use:   "sync",
		Short: "Ingest data from git, GitHub, and Claude Code sessions",
		Long:  "Sync analyzes a repository's git history, fetches PR data from GitHub,\nand optionally parses Claude Code session data to compute metrics.",
		RunE: func(cmd *cobra.Command, args []string) error {
			path, err := resolveRepoPath(repoPath)
			if err != nil {
				return err
			}

			database, err := openDB()
			if err != nil {
				return err
			}
			defer database.Close()

			result, err := axsync.Run(database, axsync.Options{
				RepoPath: path,
				Since:    since,
			})
			if err != nil {
				return err
			}

			fmt.Printf("\nSync complete for %s/%s\n", result.Owner, result.Repo)
			fmt.Printf("  PRs synced: %d\n", result.PRsSynced)
			if result.PRsFailed > 0 {
				fmt.Printf("  PRs failed: %d\n", result.PRsFailed)
			}
			if result.SessionsParsed > 0 {
				fmt.Printf("  Sessions parsed: %d\n", result.SessionsParsed)
				fmt.Printf("  Sessions correlated: %d\n", result.SessionsCorrelated)
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().StringVar(&since, "since", "", "Only sync data after this date (YYYY-MM-DD)")

	return cmd
}

func newReportCmd() *cobra.Command {
	var repoPath string
	var prNumber int

	cmd := &cobra.Command{
		Use:   "report",
		Short: "Print metrics summary",
		Long:  "Report displays computed metrics for a repository or a specific pull request.",
		RunE: func(cmd *cobra.Command, args []string) error {
			path, err := resolveRepoPath(repoPath)
			if err != nil {
				return err
			}

			database, err := openDB()
			if err != nil {
				return err
			}
			defer database.Close()

			repo, err := db.GetRepoByPath(database, path)
			if err != nil {
				return err
			}
			if repo == nil {
				return fmt.Errorf("repo not found — run 'ax sync --repo %s' first", path)
			}

			if prNumber > 0 {
				return printPRReport(database, repo, prNumber)
			}
			return printRepoReport(database, repo)
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().IntVar(&prNumber, "pr", 0, "Show metrics for a specific PR number")

	return cmd
}

func printRepoReport(database *sqlx.DB, repo *db.Repo) error {
	owner := repo.GithubOwner.String
	repoName := repo.GithubRepo.String
	fmt.Printf("\n  %s/%s\n", owner, repoName)
	if repo.LastSyncedAt.Valid {
		fmt.Printf("  Last synced: %s\n\n", repo.LastSyncedAt.String)
	}

	prs, err := db.GetPRsForRepo(database, repo.ID)
	if err != nil {
		return err
	}

	if len(prs) == 0 {
		fmt.Println("  No PRs found.")
		return nil
	}

	// Aggregate metrics
	var totalPostOpen, prCount, acceptedCount, withTests, withoutTests int
	var totalCI float64
	var ciCount int
	var totalMessages, totalIterations, msgCount, iterCount int
	var totalCost float64
	var costCount int
	var totalSelfCorrection, totalCtxEfficiency float64
	var scCount, ceCount int
	var totalErrors, errorCount int

	for _, pr := range prs {
		m, err := db.GetPRMetrics(database, pr.ID)
		if err != nil || m == nil {
			continue
		}
		prCount++

		if m.PostOpenCommits.Valid {
			totalPostOpen += int(m.PostOpenCommits.Int64)
		}
		if m.FirstPassAccepted.Valid && m.FirstPassAccepted.Int64 == 1 {
			acceptedCount++
		}
		if m.CISuccessRate.Valid {
			totalCI += m.CISuccessRate.Float64
			ciCount++
		}
		if m.HasTests.Valid {
			if m.HasTests.Int64 == 1 {
				withTests++
			} else {
				withoutTests++
			}
		}
		if m.MessagesPerPR.Valid {
			totalMessages += int(m.MessagesPerPR.Int64)
			msgCount++
		}
		if m.IterationDepth.Valid {
			totalIterations += int(m.IterationDepth.Int64)
			iterCount++
		}
		if m.TokenCostUSD.Valid {
			totalCost += m.TokenCostUSD.Float64
			costCount++
		}
		if m.SelfCorrectionRate.Valid {
			totalSelfCorrection += m.SelfCorrectionRate.Float64
			scCount++
		}
		if m.ContextEfficiency.Valid {
			totalCtxEfficiency += m.ContextEfficiency.Float64
			ceCount++
		}
		if m.ErrorRecoveryAttempts.Valid {
			totalErrors += int(m.ErrorRecoveryAttempts.Int64)
			errorCount++
		}
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "  METRIC\tVALUE\tDESCRIPTION")
	fmt.Fprintln(w, "  ------\t-----\t-----------")

	if prCount > 0 {
		avgPostOpen := float64(totalPostOpen) / float64(prCount)
		fmt.Fprintf(w, "  Avg post-open commits\t%.1f\tCommits after PR opened\n", avgPostOpen)

		acceptRate := float64(acceptedCount) / float64(prCount) * 100
		fmt.Fprintf(w, "  First-pass acceptance\t%.0f%%\tPRs merged without changes requested\n", acceptRate)
	}

	if ciCount > 0 {
		avgCI := totalCI / float64(ciCount) * 100
		fmt.Fprintf(w, "  CI success rate\t%.0f%%\tChecks passing on first push\n", avgCI)
	}

	testTotal := withTests + withoutTests
	if testTotal > 0 {
		testRate := float64(withTests) / float64(testTotal) * 100
		fmt.Fprintf(w, "  PRs with tests\t%.0f%%\tPRs that include test file changes\n", testRate)
	}

	// Session-dependent metrics
	if msgCount > 0 {
		avgMsg := float64(totalMessages) / float64(msgCount)
		fmt.Fprintf(w, "  Avg messages/PR\t%.1f\tHuman messages per PR\n", avgMsg)
	}
	if iterCount > 0 {
		avgIter := float64(totalIterations) / float64(iterCount)
		fmt.Fprintf(w, "  Avg iteration depth\t%.1f\tHuman→agent turn pairs per PR\n", avgIter)
	}
	if costCount > 0 {
		avgCost := totalCost / float64(costCount)
		fmt.Fprintf(w, "  Avg token cost/PR\t$%.2f\tDollar cost per PR\n", avgCost)
		fmt.Fprintf(w, "  Total token cost\t$%.2f\tAcross %d PRs\n", totalCost, costCount)
	}
	if scCount > 0 {
		avgSC := totalSelfCorrection / float64(scCount) * 100
		fmt.Fprintf(w, "  Self-correction rate\t%.0f%%\tAgent error recovery without human help\n", avgSC)
	}
	if ceCount > 0 {
		avgCE := totalCtxEfficiency / float64(ceCount)
		fmt.Fprintf(w, "  Context efficiency\t%.2f\tFiles modified / files read\n", avgCE)
	}

	fmt.Fprintf(w, "  Total PRs\t%d\t\n", len(prs))

	w.Flush()
	fmt.Println()

	return nil
}

func printPRReport(database *sqlx.DB, repo *db.Repo, prNumber int) error {
	var pr db.PR
	err := database.Get(&pr, "SELECT * FROM prs WHERE repo_id = ? AND number = ?", repo.ID, prNumber)
	if err == sql.ErrNoRows {
		return fmt.Errorf("PR #%d not found — run 'ax sync' first", prNumber)
	}
	if err != nil {
		return err
	}

	m, err := db.GetPRMetrics(database, pr.ID)
	if err != nil {
		return err
	}

	fmt.Printf("\n  PR #%d: %s\n", pr.Number, pr.Title.String)
	fmt.Printf("  State: %s  |  Branch: %s\n", pr.State.String, pr.Branch.String)
	fmt.Printf("  +%d -%d across %d files\n\n", pr.Additions, pr.Deletions, pr.ChangedFiles)

	if m == nil {
		fmt.Println("  No metrics computed yet.")
		return nil
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "  METRIC\tVALUE")
	fmt.Fprintln(w, "  ------\t-----")

	if m.PostOpenCommits.Valid {
		fmt.Fprintf(w, "  Post-open commits\t%d\n", m.PostOpenCommits.Int64)
	}
	if m.FirstPassAccepted.Valid {
		if m.FirstPassAccepted.Int64 == 1 {
			fmt.Fprintf(w, "  First-pass accepted\tYes\n")
		} else {
			fmt.Fprintf(w, "  First-pass accepted\tNo\n")
		}
	}
	if m.CISuccessRate.Valid {
		fmt.Fprintf(w, "  CI success rate\t%.0f%%\n", m.CISuccessRate.Float64*100)
	}
	if m.HasTests.Valid {
		if m.HasTests.Int64 == 1 {
			fmt.Fprintf(w, "  Includes tests\tYes\n")
		} else {
			fmt.Fprintf(w, "  Includes tests\tNo\n")
		}
	}
	if m.DiffChurnLines.Valid {
		fmt.Fprintf(w, "  Diff churn (lines)\t%d\n", m.DiffChurnLines.Int64)
	}
	if m.LineRevisitRate.Valid {
		fmt.Fprintf(w, "  Line revisit rate\t%.2f\n", m.LineRevisitRate.Float64)
	}
	if m.MessagesPerPR.Valid {
		fmt.Fprintf(w, "  Messages\t%d\n", m.MessagesPerPR.Int64)
	}
	if m.IterationDepth.Valid {
		fmt.Fprintf(w, "  Iteration depth\t%d\n", m.IterationDepth.Int64)
	}
	if m.TokenCostUSD.Valid {
		fmt.Fprintf(w, "  Token cost\t$%.2f\n", m.TokenCostUSD.Float64)
	}
	if m.SelfCorrectionRate.Valid {
		fmt.Fprintf(w, "  Self-correction rate\t%.0f%%\n", m.SelfCorrectionRate.Float64*100)
	}
	if m.ContextEfficiency.Valid {
		fmt.Fprintf(w, "  Context efficiency\t%.2f\n", m.ContextEfficiency.Float64)
	}
	if m.ErrorRecoveryAttempts.Valid {
		fmt.Fprintf(w, "  Error recovery attempts\t%d\n", m.ErrorRecoveryAttempts.Int64)
	}

	w.Flush()
	fmt.Println()

	return nil
}

func newStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show tracked repos and last sync time",
		RunE: func(cmd *cobra.Command, args []string) error {
			database, err := openDB()
			if err != nil {
				return err
			}
			defer database.Close()

			repos, err := db.ListRepos(database)
			if err != nil {
				return err
			}

			if len(repos) == 0 {
				fmt.Println("No tracked repos. Run 'ax sync --repo <path>' to start.")
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "\n  REPO\tLAST SYNCED")
			fmt.Fprintln(w, "  ----\t-----------")
			for _, r := range repos {
				name := r.Path
				if r.GithubOwner.Valid && r.GithubRepo.Valid {
					name = r.GithubOwner.String + "/" + r.GithubRepo.String
				}
				synced := "never"
				if r.LastSyncedAt.Valid {
					synced = r.LastSyncedAt.String
				}
				fmt.Fprintf(w, "  %s\t%s\n", name, synced)
			}
			w.Flush()
			fmt.Println()

			return nil
		},
	}
}

func newDashboardCmd() *cobra.Command {
	var port int

	cmd := &cobra.Command{
		Use:   "dashboard",
		Short: "Start the web dashboard",
		Long:  "Starts the AX web dashboard on a local port.\nThe dashboard reads from the same database as the CLI.",
		RunE: func(cmd *cobra.Command, args []string) error {
			// Find the dashboard directory relative to the ax binary
			dashboardDir := findDashboardDir()
			if dashboardDir == "" {
				return fmt.Errorf("dashboard not found — expected at <ax-repo>/dashboard/\nRun from the ax source directory or set AX_DASHBOARD_DIR")
			}

			fmt.Printf("Starting AX dashboard at http://localhost:%d\n", port)
			fmt.Println("Press Ctrl+C to stop.")

			// Check if node_modules exists
			if _, err := os.Stat(filepath.Join(dashboardDir, "node_modules")); os.IsNotExist(err) {
				fmt.Println("Installing dashboard dependencies...")
				install := exec.Command("npm", "install")
				install.Dir = dashboardDir
				install.Stdout = os.Stdout
				install.Stderr = os.Stderr
				if err := install.Run(); err != nil {
					return fmt.Errorf("failed to install dependencies: %w", err)
				}
			}

			dev := exec.Command("npx", "next", "dev", "--port", fmt.Sprintf("%d", port))
			dev.Dir = dashboardDir
			dev.Stdout = os.Stdout
			dev.Stderr = os.Stderr
			return dev.Run()
		},
	}

	cmd.Flags().IntVar(&port, "port", 3333, "Port to run the dashboard on")

	return cmd
}

func findDashboardDir() string {
	// Check env var first
	if dir := os.Getenv("AX_DASHBOARD_DIR"); dir != "" {
		return dir
	}

	// Try relative to the binary
	exe, err := os.Executable()
	if err == nil {
		dir := filepath.Join(filepath.Dir(exe), "..", "dashboard")
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
	}

	// Try relative to cwd
	cwd, err := os.Getwd()
	if err == nil {
		dir := filepath.Join(cwd, "dashboard")
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
	}

	return ""
}

func init() {
	log.SetFlags(0)
	log.SetPrefix("ax: ")
}
