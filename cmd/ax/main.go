// Package main is the entry point for the ax CLI.
// ax measures developer experience for agentic coding workflows.
package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/austinroos/ax/internal/config"
	"github.com/austinroos/ax/internal/db"
	axexport "github.com/austinroos/ax/internal/export"
	"github.com/austinroos/ax/internal/hooks"
	"github.com/austinroos/ax/internal/push"
	axsync "github.com/austinroos/ax/internal/sync"
	"github.com/austinroos/ax/internal/ui"
	"github.com/austinroos/ax/internal/watch"
	"github.com/charmbracelet/lipgloss"
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
	root.AddCommand(newInitCmd())
	root.AddCommand(newWatchCmd())
	root.AddCommand(newPushCmd())
	root.AddCommand(newExportCmd())

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// openDB opens the ax database, creating it if needed.
func openDB() (*db.Store, error) {
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
	var sessionsOnly bool

	cmd := &cobra.Command{
		Use:   "sync",
		Short: "Ingest data from git, GitHub, and Claude Code sessions",
		Long: `Sync analyzes a repository's git history, fetches PR data from GitHub,
and optionally parses Claude Code session data to compute metrics.

Use --sessions-only for a fast sync that only re-parses Claude Code sessions
without making GitHub API calls. Useful for mid-session updates.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			path, err := resolveRepoPath(repoPath)
			if err != nil {
				return err
			}

			store, err := openDB()
			if err != nil {
				return err
			}
			defer store.Close()

			var result *axsync.Result
			if sessionsOnly {
				result, err = axsync.RunSessionsOnly(store.DB, axsync.Options{
					RepoPath: path,
				})
			} else {
				result, err = axsync.Run(store.DB, axsync.Options{
					RepoPath: path,
					Since:    since,
				})
			}
			if err != nil {
				return err
			}

			if result.Owner == "" && result.Repo == "" {
				ui.CompleteBanner("No data to sync (repo not yet tracked)")
				return nil
			}
			ui.CompleteBanner(fmt.Sprintf("Sync complete for %s", ui.Highlight.Render(result.Owner+"/"+result.Repo)))

			// PR summary line
			prParts := []string{fmt.Sprintf("%d synced", result.PRsSynced)}
			if result.PRsFinalized > 0 {
				prParts = append(prParts, ui.Success.Render(fmt.Sprintf("%d finalized", result.PRsFinalized)))
			}
			if result.PRsSkipped > 0 {
				prParts = append(prParts, ui.Muted(fmt.Sprintf("%d unchanged", result.PRsSkipped)))
			}
			if result.PRsOpen > 0 {
				prParts = append(prParts, fmt.Sprintf("%d open", result.PRsOpen))
			}
			if result.PRsFailed > 0 {
				prParts = append(prParts, ui.Error.Render(fmt.Sprintf("%d failed", result.PRsFailed)))
			}
			ui.MetricRow("PRs", strings.Join(prParts, ", "))

			if result.SessionsParsed > 0 {
				ui.MetricRow("Sessions", fmt.Sprintf("%d parsed, %d correlated", result.SessionsParsed, result.SessionsCorrelated))
			}
			if result.PlansAnalyzed > 0 {
				ui.MetricRow("Plans", fmt.Sprintf("%d analyzed", result.PlansAnalyzed))
			}
			if result.TotalCostUSD > 0 {
				costStr := ui.FormatCost(result.TotalCostUSD) + " total"
				if result.UnmergedCostUSD > 0 {
					wasteColor := ui.GoodBad(result.UnmergedRate, 0.1, false)
					wasteStyle := lipgloss.NewStyle().Foreground(wasteColor)
					costStr += ", " + wasteStyle.Render(fmt.Sprintf("%s unmerged (%.0f%% waste)", ui.FormatCost(result.UnmergedCostUSD), result.UnmergedRate*100))
				}
				ui.MetricRow("Cost", costStr)
			}

			// Auto-push to team server if configured
			cfg, _ := config.LoadConfig()
			if cfg.IsTeamMode() {
				repo, repoErr := db.GetRepoByPath(store.DB, path)
				if repoErr == nil && repo != nil {
					payload, extractErr := push.ExtractPayload(store.DB, repo.ID)
					if extractErr == nil {
						client := push.NewClient(cfg.ServerURL, cfg.APIKey)
						pushResp, pushErr := client.Push(payload)
						if pushErr != nil {
							ui.Warnf("failed to push to team server: %v", pushErr)
						} else if pushResp.OK {
							ui.MetricRow("Pushed", fmt.Sprintf("%s (%d PRs, %d sessions)",
								ui.URL.Render(cfg.ServerURL), pushResp.Entities["prs"], pushResp.Entities["sessions"]))
						}
					}
				}
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().StringVar(&since, "since", "", "Only sync data after this date (YYYY-MM-DD)")
	cmd.Flags().BoolVar(&sessionsOnly, "sessions-only", false, "Fast sync: only re-parse Claude Code sessions (no GitHub API calls)")

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

			store, err := openDB()
			if err != nil {
				return err
			}
			defer store.Close()

			repo, err := db.GetRepoByPath(store.DB, path)
			if err != nil {
				return err
			}
			if repo == nil {
				return fmt.Errorf("repo not found — run 'ax sync --repo %s' first", path)
			}

			if prNumber > 0 {
				return printPRReport(store.DB, repo, prNumber)
			}
			return printRepoReport(store.DB, repo)
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().IntVar(&prNumber, "pr", 0, "Show metrics for a specific PR number")

	return cmd
}

func printRepoReport(database *sqlx.DB, repo *db.Repo) error {
	owner := repo.GithubOwner.String
	repoName := repo.GithubRepo.String
	ui.SectionHeader(ui.Highlight.Render(owner+"/"+repoName))
	if repo.LastSyncedAt.Valid {
		ui.MetricRow("Last synced", repo.LastSyncedAt.String)
	}

	prs, err := db.GetFinalizedPRsForRepo(database, repo.ID)
	if err != nil {
		return err
	}

	if len(prs) == 0 {
		fmt.Println()
		fmt.Printf("  %s\n\n", ui.Faint.Render("No finalized PRs found. Metrics are computed when PRs are merged or closed."))
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

	fmt.Println()
	fmt.Printf("  %s\n", ui.SubHeader.Render("OUTPUT QUALITY"))
	if prCount > 0 {
		avgPostOpen := float64(totalPostOpen) / float64(prCount)
		ui.MetricRowColored("Avg post-open commits", fmt.Sprintf("%.1f", avgPostOpen), ui.GoodBad(avgPostOpen, 1.0, false))

		acceptRate := float64(acceptedCount) / float64(prCount)
		ui.MetricRowColored("First-pass acceptance", ui.FormatPct(acceptRate), ui.GoodBad(acceptRate, 0.8, true))
	}
	if ciCount > 0 {
		avgCI := totalCI / float64(ciCount)
		ui.MetricRowColored("CI success rate", ui.FormatPct(avgCI), ui.GoodBad(avgCI, 0.9, true))
	}
	testTotal := withTests + withoutTests
	if testTotal > 0 {
		testRate := float64(withTests) / float64(testTotal)
		ui.MetricRowColored("Test coverage", ui.FormatPct(testRate), ui.GoodBad(testRate, 0.7, true))
	}

	if msgCount > 0 || costCount > 0 {
		fmt.Println()
		fmt.Printf("  %s\n", ui.SubHeader.Render("PROMPT EFFICIENCY"))
		if msgCount > 0 {
			avgMsg := float64(totalMessages) / float64(msgCount)
			ui.MetricRowColored("Avg messages/PR", fmt.Sprintf("%.1f", avgMsg), ui.GoodBad(avgMsg, 10, false))
		}
		if iterCount > 0 {
			avgIter := float64(totalIterations) / float64(iterCount)
			ui.MetricRowColored("Avg iteration depth", fmt.Sprintf("%.1f", avgIter), ui.GoodBad(avgIter, 5, false))
		}
		if costCount > 0 {
			avgCost := totalCost / float64(costCount)
			ui.MetricRow("Avg token cost/PR", ui.FormatCost(avgCost))
			ui.MetricRow("Total token cost", fmt.Sprintf("%s across %d PRs", ui.FormatCost(totalCost), costCount))
		}
	}

	if scCount > 0 || ceCount > 0 {
		fmt.Println()
		fmt.Printf("  %s\n", ui.SubHeader.Render("AGENT BEHAVIOR"))
		if scCount > 0 {
			avgSC := totalSelfCorrection / float64(scCount)
			ui.MetricRowColored("Self-correction rate", ui.FormatPct(avgSC), ui.GoodBad(avgSC, 0.8, true))
		}
		if ceCount > 0 {
			avgCE := totalCtxEfficiency / float64(ceCount)
			ui.MetricRow("Context efficiency", fmt.Sprintf("%.2f", avgCE))
		}
		if errorCount > 0 {
			avgErr := float64(totalErrors) / float64(errorCount)
			ui.MetricRowColored("Avg error recovery", fmt.Sprintf("%.1f", avgErr), ui.GoodBad(avgErr, 3, false))
		}
	}

	fmt.Println()
	ui.MetricRow("Total PRs", fmt.Sprintf("%d", len(prs)))

	// Show unmerged token spend if available
	repoMetrics, _ := db.GetRepoMetrics(database, repo.ID, "all")
	if len(repoMetrics) > 0 {
		rm := repoMetrics[0]
		if rm.UnmergedCostUSD > 0 {
			wasteColor := ui.GoodBad(rm.UnmergedRate.Float64, 0.1, false)
			wasteStyle := lipgloss.NewStyle().Foreground(wasteColor)
			ui.MetricRow("Unmerged spend", fmt.Sprintf("%s / %s (%s)",
				ui.FormatCost(rm.UnmergedCostUSD), ui.FormatCost(rm.TotalCostUSD),
				wasteStyle.Render(fmt.Sprintf("%.0f%% waste", rm.UnmergedRate.Float64*100))))
		}
	}

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

	ui.SectionHeader(fmt.Sprintf("PR #%d: %s", pr.Number, ui.Bold.Render(pr.Title.String)))
	stateColor := ui.Green
	if pr.State.String == "closed" {
		stateColor = ui.Red
	} else if pr.State.String == "merged" {
		stateColor = ui.Purple
	}
	stateStyle := lipgloss.NewStyle().Foreground(stateColor)
	ui.MetricRow("State", stateStyle.Render(pr.State.String))
	ui.MetricRow("Branch", pr.Branch.String)
	ui.MetricRow("Changes", fmt.Sprintf("%s  %s  %d files",
		ui.Success.Render(fmt.Sprintf("+%d", pr.Additions)),
		ui.Error.Render(fmt.Sprintf("-%d", pr.Deletions)),
		pr.ChangedFiles))

	if m == nil {
		fmt.Printf("\n  %s\n\n", ui.Faint.Render("No metrics computed yet."))
		return nil
	}

	if m.MetricsFinalized == 1 {
		ui.MetricRow("Finalized", m.FinalizedAt.String)
	} else {
		ui.MetricRow("Status", ui.Warning.Render("pending (PR still in-flight)"))
	}

	fmt.Println()
	fmt.Printf("  %s\n", ui.SubHeader.Render("OUTPUT QUALITY"))
	if m.PostOpenCommits.Valid {
		ui.MetricRowColored("Post-open commits", fmt.Sprintf("%d", m.PostOpenCommits.Int64), ui.GoodBad(float64(m.PostOpenCommits.Int64), 1.0, false))
	}
	if m.FirstPassAccepted.Valid {
		ui.MetricRow("First-pass accepted", ui.YesNo(m.FirstPassAccepted.Int64 == 1))
	}
	if m.CISuccessRate.Valid {
		ui.MetricRowColored("CI success rate", ui.FormatPct(m.CISuccessRate.Float64), ui.GoodBad(m.CISuccessRate.Float64, 0.9, true))
	}
	if m.HasTests.Valid {
		ui.MetricRow("Includes tests", ui.YesNo(m.HasTests.Int64 == 1))
	}
	if m.DiffChurnLines.Valid {
		ui.MetricRow("Diff churn", fmt.Sprintf("%d lines", m.DiffChurnLines.Int64))
	}
	if m.LineRevisitRate.Valid {
		ui.MetricRow("Line revisit rate", fmt.Sprintf("%.2f", m.LineRevisitRate.Float64))
	}

	if m.MessagesPerPR.Valid || m.TokenCostUSD.Valid {
		fmt.Println()
		fmt.Printf("  %s\n", ui.SubHeader.Render("PROMPT EFFICIENCY"))
		if m.MessagesPerPR.Valid {
			ui.MetricRow("Messages", fmt.Sprintf("%d", m.MessagesPerPR.Int64))
		}
		if m.IterationDepth.Valid {
			ui.MetricRow("Iteration depth", fmt.Sprintf("%d", m.IterationDepth.Int64))
		}
		if m.TokenCostUSD.Valid {
			ui.MetricRow("Token cost", ui.FormatCost(m.TokenCostUSD.Float64))
		}
	}

	if m.SelfCorrectionRate.Valid || m.ContextEfficiency.Valid {
		fmt.Println()
		fmt.Printf("  %s\n", ui.SubHeader.Render("AGENT BEHAVIOR"))
		if m.SelfCorrectionRate.Valid {
			ui.MetricRowColored("Self-correction rate", ui.FormatPct(m.SelfCorrectionRate.Float64), ui.GoodBad(m.SelfCorrectionRate.Float64, 0.8, true))
		}
		if m.ContextEfficiency.Valid {
			ui.MetricRow("Context efficiency", fmt.Sprintf("%.2f", m.ContextEfficiency.Float64))
		}
		if m.ErrorRecoveryAttempts.Valid {
			ui.MetricRow("Error recovery", fmt.Sprintf("%d", m.ErrorRecoveryAttempts.Int64))
		}
	}

	if m.PlanCoverageScore.Valid || m.PlanDeviationScore.Valid {
		fmt.Println()
		fmt.Printf("  %s\n", ui.SubHeader.Render("PLANNING"))
		if m.PlanCoverageScore.Valid {
			ui.MetricRow("Plan coverage", ui.FormatPct(m.PlanCoverageScore.Float64))
		}
		if m.PlanDeviationScore.Valid {
			ui.MetricRow("Plan deviation", ui.FormatPct(m.PlanDeviationScore.Float64))
		}
		if m.ScopeCreepDetected.Valid {
			ui.MetricRow("Scope creep", ui.YesNo(m.ScopeCreepDetected.Int64 == 1))
		}
	}

	fmt.Println()

	return nil
}

func newStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show tracked repos and last sync time",
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := openDB()
			if err != nil {
				return err
			}
			defer store.Close()

			repos, err := db.ListRepos(store.DB)
			if err != nil {
				return err
			}

			if len(repos) == 0 {
				fmt.Printf("\n  %s\n\n", ui.Faint.Render("No tracked repos. Run 'ax sync --repo <path>' to start."))
				return nil
			}

			// Build watch status lookup
			watchedMap := make(map[int64]*db.WatchedRepo)
			watched, _ := db.GetAllWatchedRepos(store.DB)
			for i := range watched {
				watchedMap[watched[i].RepoID] = &watched[i]
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintf(w, "\n  %s\t%s\t%s\t%s\n",
				ui.SubHeader.Render("REPO"),
				ui.SubHeader.Render("LAST SYNCED"),
				ui.SubHeader.Render("WATCHING"),
				ui.SubHeader.Render("LAST POLLED"))
			for _, r := range repos {
				name := r.Path
				if r.GithubOwner.Valid && r.GithubRepo.Valid {
					name = r.GithubOwner.String + "/" + r.GithubRepo.String
				}
				synced := ui.Muted("never")
				if r.LastSyncedAt.Valid {
					synced = r.LastSyncedAt.String
				}
				watching := ui.Muted("no")
				polled := ui.Muted("-")
				if wr, ok := watchedMap[r.ID]; ok && wr.Enabled == 1 {
					watching = ui.Success.Render("yes")
					if wr.LastPolledAt.Valid {
						polled = wr.LastPolledAt.String
					} else {
						polled = ui.Muted("never")
					}
				}
				fmt.Fprintf(w, "  %s\t%s\t%s\t%s\n", ui.Bold.Render(name), synced, watching, polled)
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

			fmt.Printf("\n  %s Starting dashboard at %s\n", ui.InfoIcon(), ui.URL.Render(fmt.Sprintf("http://localhost:%d", port)))
			fmt.Printf("  %s\n", ui.Faint.Render("Press Ctrl+C to stop."))

			// Check if node_modules exists
			if _, err := os.Stat(filepath.Join(dashboardDir, "node_modules")); os.IsNotExist(err) {
				ui.Step("Installing dashboard dependencies...")
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

func newInitCmd() *cobra.Command {
	var uninstall bool
	var liveSync bool
	var noWatch bool
	var watchInterval int
	var teamURL string
	var apiKey string
	var userName string

	cmd := &cobra.Command{
		Use:   "init",
		Short: "Set up AX for automatic metrics collection",
		Long: `Set up AX for automatic metrics collection.

LOCAL MODE (default):
  Installs Claude Code hooks and background GitHub polling so your
  metrics update automatically.

TEAM MODE (--team):
  Walks you through connecting to your team's AX server. Your metrics
  will automatically sync locally AND push to the shared dashboard.

Use --uninstall to remove all AX hooks and polling.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			settingsPath := hooks.DefaultSettingsPath()

			if uninstall {
				hooks.Uninstall(settingsPath)
				hooks.UninstallStopHook(settingsPath)
				watch.Uninstall()
				ui.StepDone("All AX hooks and background polling removed")
				return nil
			}

			// Team mode walkthrough
			if teamURL != "" {
				return initTeamMode(teamURL, apiKey, userName, settingsPath, liveSync, noWatch, watchInterval)
			}

			// Local mode (existing behavior)
			return initLocalMode(settingsPath, liveSync, noWatch, watchInterval)
		},
	}

	cmd.Flags().BoolVar(&uninstall, "uninstall", false, "Remove all AX hooks and background polling")
	cmd.Flags().BoolVar(&liveSync, "live", false, "Also install a Stop hook for mid-session metric updates")
	cmd.Flags().BoolVar(&noWatch, "no-watch", false, "Skip background GitHub polling setup")
	cmd.Flags().IntVar(&watchInterval, "watch-interval", 300, "Background polling interval in seconds")
	cmd.Flags().StringVar(&teamURL, "team", "", "Team server URL (e.g., https://ax.internal.company.com:8080)")
	cmd.Flags().StringVar(&apiKey, "api-key", "", "API key for the team server")
	cmd.Flags().StringVar(&userName, "user", "", "Your name (for attribution on the team dashboard)")

	return cmd
}

func initLocalMode(settingsPath string, liveSync, noWatch bool, watchInterval int) error {
	axBinary, err := os.Executable()
	if err != nil {
		axBinary = "ax"
	}

	if hooks.IsInstalled(settingsPath) {
		ui.Step("Updating AX hooks...")
	}

	if err := hooks.Install(settingsPath, axBinary); err != nil {
		return fmt.Errorf("failed to install SessionEnd hook: %w", err)
	}
	ui.StepDone("SessionEnd hook installed — full sync after each session")

	if liveSync {
		if err := hooks.InstallStopHook(settingsPath, axBinary); err != nil {
			return fmt.Errorf("failed to install Stop hook: %w", err)
		}
		ui.StepDone("Stop hook installed — lightweight sync after each response")
	}

	if !noWatch {
		if err := watch.Install(axBinary, watchInterval); err != nil {
			ui.Warnf("failed to install background polling: %v", err)
			ui.StepFail("Background polling failed (set up manually with 'ax watch install')")
		} else {
			ui.StepDone(fmt.Sprintf("Background polling installed (every %ds)", watchInterval))
		}

		initStore, dbErr := openDB()
		if dbErr == nil {
			defer initStore.Close()
			cwd, cwdErr := os.Getwd()
			if cwdErr == nil {
				repo, repoErr := db.GetRepoByPath(initStore.DB, cwd)
				if repoErr == nil && repo != nil {
					db.UpsertWatchedRepo(initStore.DB, &db.WatchedRepo{
						RepoID:              repo.ID,
						PollIntervalSeconds: watchInterval,
						Enabled:             1,
					})
				}
			}
		}
	}

	fmt.Println()
	fmt.Printf("  %s\n", ui.Bold.Render("Your metrics will now update automatically."))
	fmt.Printf("  To verify: check %s\n", ui.Code.Render("~/.claude/settings.json"))
	fmt.Printf("  To remove: run %s\n", ui.Code.Render("ax init --uninstall"))
	return nil
}

func initTeamMode(serverURL, apiKey, userName, settingsPath string, liveSync, noWatch bool, watchInterval int) error {
	ui.SectionHeader(ui.Bold.Render("AX Team Setup"))

	// Step 1: Validate inputs
	if serverURL == "" {
		return fmt.Errorf("--team flag requires a server URL")
	}
	if apiKey == "" {
		return fmt.Errorf("--api-key is required for team mode\n\n  Ask your team admin for the API key.\n  They can generate one with: ax server create-key <name>")
	}
	if userName == "" {
		return fmt.Errorf("--user is required for team mode (your name for attribution)")
	}

	// Step 2: Test server connectivity
	ui.NumberedStep(1, 4, "Testing server connectivity...")
	fmt.Printf("           Server: %s\n", ui.URL.Render(serverURL))

	client := push.NewClient(serverURL, apiKey)

	if err := client.HealthCheck(); err != nil {
		ui.StepFail("Server unreachable")
		fmt.Println()
		fmt.Printf("  Could not reach the server at %s\n", ui.URL.Render(serverURL))
		fmt.Printf("  Check that:\n")
		fmt.Printf("    %s The URL is correct (include port if needed)\n", ui.ArrowIcon())
		fmt.Printf("    %s The server is running (%s)\n", ui.ArrowIcon(), ui.Code.Render("docker compose ps"))
		fmt.Printf("    %s Your network can reach it (VPN, firewall)\n", ui.ArrowIcon())
		return fmt.Errorf("server unreachable: %w", err)
	}
	fmt.Printf("           %s\n", ui.Success.Render("Server is reachable"))

	// Step 3: Validate API key
	fmt.Println()
	ui.NumberedStep(2, 4, "Validating API key...")

	if err := client.Ping(); err != nil {
		ui.StepFail("API key rejected")
		fmt.Println()
		fmt.Printf("  The server is reachable but the API key was rejected.\n")
		fmt.Printf("  Check that:\n")
		fmt.Printf("    %s The API key is correct (starts with %s)\n", ui.ArrowIcon(), ui.Code.Render("ax_k1_"))
		fmt.Printf("    %s The key hasn't been revoked\n", ui.ArrowIcon())
		fmt.Printf("    %s Ask your admin to verify with: %s\n", ui.ArrowIcon(), ui.Code.Render("ax server list-keys"))
		return fmt.Errorf("API key validation failed: %w", err)
	}
	fmt.Printf("           %s\n", ui.Success.Render("API key is valid"))

	// Step 4: Save config
	fmt.Println()
	ui.NumberedStep(3, 4, "Saving team configuration...")

	cfg := &config.Config{
		Mode:      "team",
		ServerURL: serverURL,
		APIKey:    apiKey,
		UserName:  userName,
	}
	if err := config.SaveConfig(cfg); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	fmt.Printf("           Saved to %s\n", ui.Code.Render("~/.ax/config.json"))

	// Step 5: Install hooks
	fmt.Println()
	ui.NumberedStep(4, 4, "Installing hooks...")

	axBinary, err := os.Executable()
	if err != nil {
		axBinary = "ax"
	}

	if err := hooks.Install(settingsPath, axBinary); err != nil {
		return fmt.Errorf("failed to install SessionEnd hook: %w", err)
	}
	fmt.Printf("           %s SessionEnd hook installed\n", ui.SuccessIcon())

	if liveSync {
		if err := hooks.InstallStopHook(settingsPath, axBinary); err != nil {
			return fmt.Errorf("failed to install Stop hook: %w", err)
		}
		fmt.Printf("           %s Stop hook installed\n", ui.SuccessIcon())
	}

	if !noWatch {
		if err := watch.Install(axBinary, watchInterval); err != nil {
			ui.Warnf("background polling setup failed: %v", err)
		} else {
			fmt.Printf("           %s Background polling installed\n", ui.SuccessIcon())
		}
	}

	// Success summary
	ui.CompleteBanner("Setup complete!")
	fmt.Println()
	fmt.Printf("  %s\n", ui.Bold.Render("What happens now:"))
	fmt.Printf("    %s Sessions sync locally and push to %s\n", ui.ArrowIcon(), ui.URL.Render(serverURL))
	fmt.Printf("    %s Your data will appear on the team dashboard\n", ui.ArrowIcon())
	fmt.Printf("    %s Contributions attributed to %s\n", ui.ArrowIcon(), ui.Accent.Render(userName))
	fmt.Println()
	fmt.Printf("  %s\n", ui.Bold.Render("Next step:"))
	fmt.Printf("    Run %s in a git repo to do your first sync + push.\n", ui.Code.Render("ax sync --repo ."))
	fmt.Println()
	fmt.Printf("  To remove: %s\n", ui.Code.Render("ax init --uninstall"))

	return nil
}

func newPushCmd() *cobra.Command {
	var repoPath string
	var serverURL string
	var apiKey string

	cmd := &cobra.Command{
		Use:   "push",
		Short: "Push local data to the team server",
		Long: `Push local sync data to the team server.

Reads server URL and API key from ~/.ax/config.json (set up by 'ax init --team').
You can override with --server and --api-key flags.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			path, err := resolveRepoPath(repoPath)
			if err != nil {
				return err
			}

			// Load config for defaults
			cfg, _ := config.LoadConfig()
			if serverURL == "" {
				serverURL = cfg.ServerURL
			}
			if apiKey == "" {
				apiKey = cfg.APIKey
			}

			if serverURL == "" {
				return fmt.Errorf("no server URL configured\n\n  Run 'ax init --team <url> --api-key <key> --user <name>' to set up team mode\n  Or pass --server and --api-key flags")
			}
			if apiKey == "" {
				return fmt.Errorf("no API key configured — use --api-key or run 'ax init --team'")
			}

			store, err := openDB()
			if err != nil {
				return err
			}
			defer store.Close()

			repo, err := db.GetRepoByPath(store.DB, path)
			if err != nil || repo == nil {
				return fmt.Errorf("repo not found — run 'ax sync --repo %s' first", path)
			}

			payload, err := push.ExtractPayload(store.DB, repo.ID)
			if err != nil {
				return fmt.Errorf("failed to extract data: %w", err)
			}

			client := push.NewClient(serverURL, apiKey)
			resp, err := client.Push(payload)
			if err != nil {
				return err
			}

			ui.CompleteBanner(fmt.Sprintf("Pushed to %s", ui.URL.Render(serverURL)))
			ui.MetricRow("Data", fmt.Sprintf("%d PRs, %d sessions, %d commits",
				resp.Entities["prs"], resp.Entities["sessions"], resp.Entities["commits"]))
			return nil
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().StringVar(&serverURL, "server", "", "Team server URL (overrides config)")
	cmd.Flags().StringVar(&apiKey, "api-key", "", "API key (overrides config)")

	return cmd
}

func newWatchCmd() *cobra.Command {
	var repoPath string
	var once bool
	var interval int

	cmd := &cobra.Command{
		Use:   "watch",
		Short: "Poll GitHub for PR state changes and finalize metrics",
		Long: `Watch polls GitHub for PR state changes (merges, closures) and
finalizes metrics for PRs that reach terminal states.

By default, watches all repos in the watched_repos table. Use --repo
to watch a specific repo.

Use 'ax watch install' to set up automatic background polling via
launchd (macOS) or cron (Linux).`,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := openDB()
			if err != nil {
				return err
			}
			defer store.Close()

			if once {
				return runWatchOnce(store.DB, repoPath)
			}
			return runWatchLoop(store.DB, repoPath, interval)
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Watch a specific repo (defaults to all watched repos)")
	cmd.Flags().BoolVar(&once, "once", false, "Run a single poll cycle and exit")
	cmd.Flags().IntVar(&interval, "interval", 300, "Poll interval in seconds (default: 5 minutes)")

	cmd.AddCommand(newWatchInstallCmd())
	cmd.AddCommand(newWatchUninstallCmd())
	cmd.AddCommand(newWatchStatusCmd())

	return cmd
}

func runWatchOnce(database *sqlx.DB, repoPath string) error {
	var result *axsync.WatchResult
	var err error

	if repoPath != "" {
		path, pathErr := resolveRepoPath(repoPath)
		if pathErr != nil {
			return pathErr
		}
		result, err = axsync.RunGitHubOnlyForRepo(database, path)
	} else {
		result, err = axsync.RunGitHubOnly(database)
	}
	if err != nil {
		return err
	}

	if result.PRsFinalized > 0 {
		ui.StepDone(fmt.Sprintf("Polled %d repo(s): %d PRs checked, %s",
			result.ReposPolled, result.PRsChecked,
			ui.Success.Render(fmt.Sprintf("%d finalized", result.PRsFinalized))))
	}
	return nil
}

func runWatchLoop(database *sqlx.DB, repoPath string, intervalSec int) error {
	fmt.Printf("\n  %s Watching for PR state changes every %ds. %s\n", ui.InfoIcon(), intervalSec, ui.Faint.Render("Press Ctrl+C to stop."))

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	// Run immediately on start
	if err := runWatchOnce(database, repoPath); err != nil {
		ui.Warnf("poll failed: %v", err)
	}

	for {
		select {
		case <-ticker.C:
			if err := runWatchOnce(database, repoPath); err != nil {
				ui.Warnf("poll failed: %v", err)
			}
		case <-sigCh:
			fmt.Printf("\n  %s\n", ui.Faint.Render("Stopping watch."))
			return nil
		}
	}
}

func newWatchInstallCmd() *cobra.Command {
	var interval int

	cmd := &cobra.Command{
		Use:   "install",
		Short: "Install system-level background polling (launchd/cron)",
		RunE: func(cmd *cobra.Command, args []string) error {
			axBinary, err := os.Executable()
			if err != nil {
				axBinary = "ax"
			}

			if err := watch.Install(axBinary, interval); err != nil {
				return err
			}
			ui.StepDone(fmt.Sprintf("Background polling installed (every %ds)", interval))
			fmt.Printf("  Logs: %s\n", ui.Code.Render("/tmp/ax-watch.log"))
			return nil
		},
	}

	cmd.Flags().IntVar(&interval, "interval", 300, "Poll interval in seconds")
	return cmd
}

func newWatchUninstallCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "uninstall",
		Short: "Remove system-level background polling",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := watch.Uninstall(); err != nil {
				return err
			}
			ui.StepDone("Background polling removed")
			return nil
		},
	}
}

func newWatchStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show watched repos and polling status",
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := openDB()
			if err != nil {
				return err
			}
			defer store.Close()

			watched, err := db.GetAllWatchedRepos(store.DB)
			if err != nil {
				return err
			}

			// System-level scheduling status
			if watch.IsInstalled() {
				fmt.Printf("\n  System polling: %s\n", ui.Success.Render("active"))
			} else {
				fmt.Printf("\n  System polling: %s (run %s)\n", ui.Faint.Render("not installed"), ui.Code.Render("ax watch install"))
			}

			if len(watched) == 0 {
				fmt.Printf("  %s\n\n", ui.Faint.Render("No watched repos. Run 'ax init' to set up watching."))
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintf(w, "\n  %s\t%s\t%s\t%s\n",
				ui.SubHeader.Render("REPO"),
				ui.SubHeader.Render("INTERVAL"),
				ui.SubHeader.Render("LAST POLLED"),
				ui.SubHeader.Render("ENABLED"))

			for _, wr := range watched {
				var repoName string
				err := store.DB.Get(&repoName, `
					SELECT COALESCE(github_owner || '/' || github_repo, path)
					FROM repos WHERE id = ?
				`, wr.RepoID)
				if err != nil {
					repoName = fmt.Sprintf("repo#%d", wr.RepoID)
				}

				polled := ui.Muted("never")
				if wr.LastPolledAt.Valid {
					polled = wr.LastPolledAt.String
				}
				enabled := ui.Muted("no")
				if wr.Enabled == 1 {
					enabled = ui.Success.Render("yes")
				}
				fmt.Fprintf(w, "  %s\t%ds\t%s\t%s\n", ui.Bold.Render(repoName), wr.PollIntervalSeconds, polled, enabled)
			}
			w.Flush()
			fmt.Println()

			return nil
		},
	}
}

func newExportCmd() *cobra.Command {
	var repoPath string
	var allRepos bool
	var prNumber int
	var format string
	var since string
	var until string
	var aggregate bool
	var output string
	var finalizedOnly bool

	cmd := &cobra.Command{
		Use:   "export",
		Short: "Export metrics as JSON, JSONL, or CSV",
		Long: `Export metrics in machine-readable formats for integration with
external tools, spreadsheets, or BI dashboards.

Output goes to stdout by default (pipe to jq, csvtool, etc.).
Use --output to write to a file.

By default, only finalized (merged/closed) PRs are exported.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := openDB()
			if err != nil {
				return err
			}
			defer store.Close()

			// Resolve repo ID
			var repoID int64
			if !allRepos {
				path, pathErr := resolveRepoPath(repoPath)
				if pathErr != nil {
					return pathErr
				}
				repo, repoErr := db.GetRepoByPath(store.DB, path)
				if repoErr != nil || repo == nil {
					return fmt.Errorf("repo not found — run 'ax sync --repo %s' first", path)
				}
				repoID = repo.ID
			}

			opts := axexport.Options{
				RepoID:        repoID,
				AllRepos:      allRepos,
				PRNumber:      prNumber,
				Since:         since,
				Until:         until,
				FinalizedOnly: finalizedOnly,
				Aggregate:     aggregate,
				Format:        format,
				Output:        output,
			}

			// Determine output writer
			var w *os.File
			if output != "" {
				f, err := os.Create(output)
				if err != nil {
					return fmt.Errorf("failed to create output file: %w", err)
				}
				defer f.Close()
				w = f
			} else {
				w = os.Stdout
			}

			if aggregate {
				rows, err := axexport.ExtractAggregates(store.DB, opts)
				if err != nil {
					return err
				}
				switch format {
				case "csv":
					return axexport.WriteCSVAggregates(w, rows)
				case "jsonl":
					return axexport.WriteJSONLAggregates(w, rows)
				default:
					return axexport.WriteJSON(w, rows)
				}
			}

			rows, err := axexport.ExtractRows(store.DB, opts)
			if err != nil {
				return err
			}

			switch format {
			case "csv":
				return axexport.WriteCSV(w, rows)
			case "jsonl":
				return axexport.WriteJSONL(w, rows)
			default:
				return axexport.WriteJSON(w, rows)
			}
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().BoolVar(&allRepos, "all-repos", false, "Export data from all tracked repos")
	cmd.Flags().IntVar(&prNumber, "pr", 0, "Export metrics for a single PR number")
	cmd.Flags().StringVar(&format, "format", "json", "Output format: json, jsonl, csv")
	cmd.Flags().StringVar(&since, "since", "", "Only include PRs created after this date (YYYY-MM-DD)")
	cmd.Flags().StringVar(&until, "until", "", "Only include PRs created before this date (YYYY-MM-DD)")
	cmd.Flags().BoolVar(&aggregate, "aggregate", false, "Export repo-level aggregate metrics")
	cmd.Flags().StringVar(&output, "output", "", "Write to file instead of stdout")
	cmd.Flags().BoolVar(&finalizedOnly, "finalized-only", true, "Only export PRs with finalized metrics")

	return cmd
}

func init() {
	log.SetFlags(0)
	log.SetPrefix("ax: ")
}
