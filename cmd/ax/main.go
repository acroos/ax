// Package main is the entry point for the ax CLI.
// ax measures developer experience for agentic coding workflows.
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/austinroos/ax/internal/config"
	"github.com/austinroos/ax/internal/db"
	"github.com/austinroos/ax/internal/hooks"
	"github.com/austinroos/ax/internal/push"
	"github.com/austinroos/ax/internal/server"
	axsync "github.com/austinroos/ax/internal/sync"
	"github.com/austinroos/ax/internal/watch"
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
	root.AddCommand(newServerCmd())

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

			fmt.Printf("\nSync complete for %s/%s\n", result.Owner, result.Repo)
			fmt.Printf("  PRs synced: %d\n", result.PRsSynced)
			if result.PRsFailed > 0 {
				fmt.Printf("  PRs failed: %d\n", result.PRsFailed)
			}
			if result.SessionsParsed > 0 {
				fmt.Printf("  Sessions parsed: %d\n", result.SessionsParsed)
				fmt.Printf("  Sessions correlated: %d\n", result.SessionsCorrelated)
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
							log.Printf("Warning: failed to push to team server: %v", pushErr)
						} else if pushResp.OK {
							fmt.Printf("  Pushed to %s (%d PRs, %d sessions)\n",
								cfg.ServerURL, pushResp.Entities["prs"], pushResp.Entities["sessions"])
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
	fmt.Printf("\n  %s/%s\n", owner, repoName)
	if repo.LastSyncedAt.Valid {
		fmt.Printf("  Last synced: %s\n\n", repo.LastSyncedAt.String)
	}

	prs, err := db.GetFinalizedPRsForRepo(database, repo.ID)
	if err != nil {
		return err
	}

	if len(prs) == 0 {
		fmt.Println("  No finalized PRs found. Metrics are computed when PRs are merged or closed.")
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

	// Show unmerged token spend if available
	repoMetrics, _ := db.GetRepoMetrics(database, repo.ID, "all")
	if len(repoMetrics) > 0 {
		rm := repoMetrics[0]
		if rm.UnmergedCostUSD > 0 {
			fmt.Println()
			fmt.Printf("  Unmerged spend: $%.2f / $%.2f (%.0f%% waste rate)\n",
				rm.UnmergedCostUSD, rm.TotalCostUSD, rm.UnmergedRate.Float64*100)
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

	fmt.Printf("\n  PR #%d: %s\n", pr.Number, pr.Title.String)
	fmt.Printf("  State: %s  |  Branch: %s\n", pr.State.String, pr.Branch.String)
	fmt.Printf("  +%d -%d across %d files\n", pr.Additions, pr.Deletions, pr.ChangedFiles)

	if m == nil {
		fmt.Println("\n  No metrics computed yet.")
		return nil
	}

	if m.MetricsFinalized == 1 {
		fmt.Printf("  Metrics finalized: %s\n\n", m.FinalizedAt.String)
	} else {
		fmt.Printf("  Metrics: pending (PR still in-flight)\n\n")
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
	if m.PlanCoverageScore.Valid {
		fmt.Fprintf(w, "  Plan coverage\t%.0f%%\n", m.PlanCoverageScore.Float64*100)
	}
	if m.PlanDeviationScore.Valid {
		fmt.Fprintf(w, "  Plan deviation\t%.0f%%\n", m.PlanDeviationScore.Float64*100)
	}
	if m.ScopeCreepDetected.Valid {
		if m.ScopeCreepDetected.Int64 == 1 {
			fmt.Fprintf(w, "  Scope creep\tYes\n")
		} else {
			fmt.Fprintf(w, "  Scope creep\tNo\n")
		}
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
				fmt.Println("No tracked repos. Run 'ax sync --repo <path>' to start.")
				return nil
			}

			// Build watch status lookup
			watchedMap := make(map[int64]*db.WatchedRepo)
			watched, _ := db.GetAllWatchedRepos(store.DB)
			for i := range watched {
				watchedMap[watched[i].RepoID] = &watched[i]
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "\n  REPO\tLAST SYNCED\tWATCHING\tLAST POLLED")
			fmt.Fprintln(w, "  ----\t-----------\t--------\t-----------")
			for _, r := range repos {
				name := r.Path
				if r.GithubOwner.Valid && r.GithubRepo.Valid {
					name = r.GithubOwner.String + "/" + r.GithubRepo.String
				}
				synced := "never"
				if r.LastSyncedAt.Valid {
					synced = r.LastSyncedAt.String
				}
				watching := "no"
				polled := "-"
				if wr, ok := watchedMap[r.ID]; ok && wr.Enabled == 1 {
					watching = "yes"
					if wr.LastPolledAt.Valid {
						polled = wr.LastPolledAt.String
					} else {
						polled = "never"
					}
				}
				fmt.Fprintf(w, "  %s\t%s\t%s\t%s\n", name, synced, watching, polled)
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
				fmt.Println("All AX hooks and background polling removed.")
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
		fmt.Println("Updating AX hooks...")
	}

	if err := hooks.Install(settingsPath, axBinary); err != nil {
		return fmt.Errorf("failed to install SessionEnd hook: %w", err)
	}
	fmt.Println("SessionEnd hook installed — full sync after each session.")

	if liveSync {
		if err := hooks.InstallStopHook(settingsPath, axBinary); err != nil {
			return fmt.Errorf("failed to install Stop hook: %w", err)
		}
		fmt.Println("Stop hook installed — lightweight sync after each response.")
	}

	if !noWatch {
		if err := watch.Install(axBinary, watchInterval); err != nil {
			log.Printf("Warning: failed to install background polling: %v", err)
			fmt.Println("Background polling: failed (you can set up manually with 'ax watch install')")
		} else {
			fmt.Printf("Background polling installed (every %ds).\n", watchInterval)
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
	fmt.Println("  Your metrics will now update automatically.")
	fmt.Println("  To verify: check ~/.claude/settings.json")
	fmt.Println("  To remove: run ax init --uninstall")
	return nil
}

func initTeamMode(serverURL, apiKey, userName, settingsPath string, liveSync, noWatch bool, watchInterval int) error {
	fmt.Println()
	fmt.Println("  AX Team Setup")
	fmt.Println("  =============")
	fmt.Println()

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
	fmt.Printf("  Step 1/4: Testing server connectivity...\n")
	fmt.Printf("           Server: %s\n", serverURL)

	client := push.NewClient(serverURL, apiKey)

	// Health check first (no auth)
	if err := client.HealthCheck(); err != nil {
		fmt.Printf("           FAILED\n\n")
		fmt.Printf("  Could not reach the server at %s\n", serverURL)
		fmt.Printf("  Check that:\n")
		fmt.Printf("    - The URL is correct (include port if needed)\n")
		fmt.Printf("    - The server is running (docker compose ps)\n")
		fmt.Printf("    - Your network can reach it (VPN, firewall)\n")
		return fmt.Errorf("server unreachable: %w", err)
	}
	fmt.Printf("           Server is reachable.\n")

	// Step 3: Validate API key
	fmt.Printf("\n  Step 2/4: Validating API key...\n")

	if err := client.Ping(); err != nil {
		fmt.Printf("           FAILED\n\n")
		fmt.Printf("  The server is reachable but the API key was rejected.\n")
		fmt.Printf("  Check that:\n")
		fmt.Printf("    - The API key is correct (starts with ax_k1_)\n")
		fmt.Printf("    - The key hasn't been revoked\n")
		fmt.Printf("    - Ask your admin to verify with: ax server list-keys\n")
		return fmt.Errorf("API key validation failed: %w", err)
	}
	fmt.Printf("           API key is valid.\n")

	// Step 4: Save config
	fmt.Printf("\n  Step 3/4: Saving team configuration...\n")

	cfg := &config.Config{
		Mode:      "team",
		ServerURL: serverURL,
		APIKey:    apiKey,
		UserName:  userName,
	}
	if err := config.SaveConfig(cfg); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	fmt.Printf("           Saved to ~/.ax/config.json\n")

	// Step 5: Install hooks (same as local mode)
	fmt.Printf("\n  Step 4/4: Installing hooks...\n")

	axBinary, err := os.Executable()
	if err != nil {
		axBinary = "ax"
	}

	if err := hooks.Install(settingsPath, axBinary); err != nil {
		return fmt.Errorf("failed to install SessionEnd hook: %w", err)
	}
	fmt.Printf("           SessionEnd hook installed.\n")

	if liveSync {
		if err := hooks.InstallStopHook(settingsPath, axBinary); err != nil {
			return fmt.Errorf("failed to install Stop hook: %w", err)
		}
		fmt.Printf("           Stop hook installed.\n")
	}

	if !noWatch {
		if err := watch.Install(axBinary, watchInterval); err != nil {
			log.Printf("           Warning: background polling setup failed: %v", err)
		} else {
			fmt.Printf("           Background polling installed.\n")
		}
	}

	// Success summary
	fmt.Println()
	fmt.Println("  Setup complete!")
	fmt.Println()
	fmt.Println("  What happens now:")
	fmt.Printf("    - When a Claude Code session ends, metrics sync locally\n")
	fmt.Printf("      and automatically push to %s\n", serverURL)
	fmt.Printf("    - Your data will appear on the team dashboard\n")
	fmt.Printf("    - Your contributions are attributed to %q\n", userName)
	fmt.Println()
	fmt.Println("  Next step:")
	fmt.Println("    Run 'ax sync --repo .' in a git repo to do your first sync + push.")
	fmt.Println()
	fmt.Println("  To remove: run 'ax init --uninstall'")

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

			fmt.Printf("Pushed to %s: %d PRs, %d sessions, %d commits\n",
				serverURL, resp.Entities["prs"], resp.Entities["sessions"], resp.Entities["commits"])
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
		fmt.Printf("Polled %d repo(s): %d PRs checked, %d finalized\n",
			result.ReposPolled, result.PRsChecked, result.PRsFinalized)
	}
	return nil
}

func runWatchLoop(database *sqlx.DB, repoPath string, intervalSec int) error {
	fmt.Printf("Watching for PR state changes every %ds. Press Ctrl+C to stop.\n", intervalSec)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	// Run immediately on start
	if err := runWatchOnce(database, repoPath); err != nil {
		log.Printf("Warning: poll failed: %v", err)
	}

	for {
		select {
		case <-ticker.C:
			if err := runWatchOnce(database, repoPath); err != nil {
				log.Printf("Warning: poll failed: %v", err)
			}
		case <-sigCh:
			fmt.Println("\nStopping watch.")
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
			fmt.Printf("Background polling installed (every %ds).\n", interval)
			fmt.Println("Logs: /tmp/ax-watch.log")
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
			fmt.Println("Background polling removed.")
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
				fmt.Println("\n  System polling: active")
			} else {
				fmt.Println("\n  System polling: not installed (run 'ax watch install')")
			}

			if len(watched) == 0 {
				fmt.Println("  No watched repos. Run 'ax init' to set up watching.")
				fmt.Println()
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "\n  REPO\tINTERVAL\tLAST POLLED\tENABLED")
			fmt.Fprintln(w, "  ----\t--------\t-----------\t-------")

			for _, wr := range watched {
				// Look up repo name
				var repoName string
				err := store.DB.Get(&repoName, `
					SELECT COALESCE(github_owner || '/' || github_repo, path)
					FROM repos WHERE id = ?
				`, wr.RepoID)
				if err != nil {
					repoName = fmt.Sprintf("repo#%d", wr.RepoID)
				}

				polled := "never"
				if wr.LastPolledAt.Valid {
					polled = wr.LastPolledAt.String
				}
				enabled := "yes"
				if wr.Enabled == 0 {
					enabled = "no"
				}
				fmt.Fprintf(w, "  %s\t%ds\t%s\t%s\n", repoName, wr.PollIntervalSeconds, polled, enabled)
			}
			w.Flush()
			fmt.Println()

			return nil
		},
	}
}

func newServerCmd() *cobra.Command {
	var port int
	var postgresConn string

	cmd := &cobra.Command{
		Use:   "server",
		Short: "Start the AX team server",
		Long: `Start the AX team server that accepts pushed data from developers
and serves metrics to the dashboard.

Requires a PostgreSQL database. Pass the connection string via
--postgres or the AX_POSTGRES environment variable.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if postgresConn == "" {
				postgresConn = os.Getenv("AX_POSTGRES")
			}
			if postgresConn == "" {
				return fmt.Errorf("PostgreSQL connection required: use --postgres or set AX_POSTGRES")
			}

			store, err := db.OpenPostgres(postgresConn)
			if err != nil {
				return fmt.Errorf("failed to connect to PostgreSQL: %w", err)
			}
			defer store.Close()

			addr := fmt.Sprintf(":%d", port)
			srv := server.New(store, addr)
			return srv.ListenAndServe()
		},
	}

	cmd.Flags().IntVar(&port, "port", 8080, "Port to listen on")
	cmd.Flags().StringVar(&postgresConn, "postgres", "", "PostgreSQL connection string")

	cmd.AddCommand(newServerInitCmd())
	cmd.AddCommand(newServerCreateKeyCmd())
	cmd.AddCommand(newServerListKeysCmd())
	cmd.AddCommand(newServerRevokeKeyCmd())

	return cmd
}

func newServerInitCmd() *cobra.Command {
	var postgresConn string

	return &cobra.Command{
		Use:   "init",
		Short: "Initialize the database and generate the first API key",
		RunE: func(cmd *cobra.Command, args []string) error {
			if postgresConn == "" {
				postgresConn = os.Getenv("AX_POSTGRES")
			}
			if postgresConn == "" {
				return fmt.Errorf("PostgreSQL connection required: use --postgres or set AX_POSTGRES")
			}

			store, err := db.OpenPostgres(postgresConn)
			if err != nil {
				return fmt.Errorf("failed to connect to PostgreSQL: %w", err)
			}
			defer store.Close()

			key, err := db.GenerateAPIKey(store.DB, "default")
			if err != nil {
				return fmt.Errorf("failed to generate API key: %w", err)
			}

			fmt.Println("AX server initialized.")
			fmt.Printf("Your API key: %s\n\n", key)
			fmt.Println("Share this key securely with your team.")
			fmt.Println("Each developer will need it for 'ax init --team'.")
			return nil
		},
	}
}

func newServerCreateKeyCmd() *cobra.Command {
	var postgresConn string

	return &cobra.Command{
		Use:   "create-key [name]",
		Short: "Generate a new API key",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if postgresConn == "" {
				postgresConn = os.Getenv("AX_POSTGRES")
			}
			if postgresConn == "" {
				return fmt.Errorf("PostgreSQL connection required")
			}

			store, err := db.OpenPostgres(postgresConn)
			if err != nil {
				return err
			}
			defer store.Close()

			key, err := db.GenerateAPIKey(store.DB, args[0])
			if err != nil {
				return err
			}

			fmt.Printf("API key for %q: %s\n", args[0], key)
			return nil
		},
	}
}

func newServerListKeysCmd() *cobra.Command {
	var postgresConn string

	return &cobra.Command{
		Use:   "list-keys",
		Short: "List all API keys",
		RunE: func(cmd *cobra.Command, args []string) error {
			if postgresConn == "" {
				postgresConn = os.Getenv("AX_POSTGRES")
			}
			if postgresConn == "" {
				return fmt.Errorf("PostgreSQL connection required")
			}

			store, err := db.OpenPostgres(postgresConn)
			if err != nil {
				return err
			}
			defer store.Close()

			keys, err := db.ListAPIKeys(store.DB)
			if err != nil {
				return err
			}

			if len(keys) == 0 {
				fmt.Println("No API keys. Run 'ax server init' to create one.")
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "NAME\tCREATED\tLAST USED\tREVOKED")
			fmt.Fprintln(w, "----\t-------\t---------\t-------")
			for _, k := range keys {
				lastUsed := "never"
				if k.LastUsedAt.Valid {
					lastUsed = k.LastUsedAt.String
				}
				revoked := "no"
				if k.Revoked == 1 {
					revoked = "yes"
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", k.Name, k.CreatedAt, lastUsed, revoked)
			}
			w.Flush()
			return nil
		},
	}
}

func newServerRevokeKeyCmd() *cobra.Command {
	var postgresConn string

	return &cobra.Command{
		Use:   "revoke-key [name]",
		Short: "Revoke an API key",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if postgresConn == "" {
				postgresConn = os.Getenv("AX_POSTGRES")
			}
			if postgresConn == "" {
				return fmt.Errorf("PostgreSQL connection required")
			}

			store, err := db.OpenPostgres(postgresConn)
			if err != nil {
				return err
			}
			defer store.Close()

			if err := db.RevokeAPIKey(store.DB, args[0]); err != nil {
				return err
			}

			fmt.Printf("Revoked API key %q.\n", args[0])
			return nil
		},
	}
}

func init() {
	log.SetFlags(0)
	log.SetPrefix("ax: ")
}
