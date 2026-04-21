// Package main is the entry point for the ax CLI.
// ax measures developer experience for agentic coding workflows.
package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/bulk"
	"github.com/austinroos/ax/internal/config"
	"github.com/austinroos/ax/internal/hooks"
	"github.com/austinroos/ax/internal/parsers"
	"github.com/austinroos/ax/internal/push"
	"github.com/austinroos/ax/internal/state"
	"github.com/austinroos/ax/internal/ui"
	"github.com/charmbracelet/huh"
	"github.com/spf13/cobra"
)

// version is set at build time via ldflags.
var version = "dev"

func main() {
	root := &cobra.Command{
		Use:     "ax",
		Short:   "Agentic coding DX metrics",
		Long:    "ax measures developer experience for agentic coding workflows.\nIt connects to the AX managed service to track metrics about\nhow effectively you work with AI coding agents.",
		Version: version,
	}

	root.AddCommand(newInitCmd())
	root.AddCommand(newPushCmd())

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// resolveRepoPath returns the repo path, defaulting to cwd.
func resolveRepoPath(flagValue string) (string, error) {
	if flagValue != "" {
		return filepath.Abs(flagValue)
	}
	return os.Getwd()
}

// gitRemoteOwnerRepo runs git to get the owner/repo from the remote URL.
func gitRemoteOwnerRepo(repoPath string) (owner, repo string, err error) {
	cmd := exec.Command("git", "-C", repoPath, "remote", "get-url", "origin")
	out, err := cmd.Output()
	if err != nil {
		return "", "", fmt.Errorf("failed to get git remote URL: %w", err)
	}
	remoteURL := strings.TrimSpace(string(out))
	return parseGitRemote(remoteURL)
}

// parseGitRemote extracts owner/repo from a GitHub remote URL.
func parseGitRemote(remoteURL string) (owner, repo string, err error) {
	return bulk.ParseGitRemote(remoteURL)
}

func newInitCmd() *cobra.Command {
	var uninstall bool
	var apiKey string

	cmd := &cobra.Command{
		Use:   "init",
		Short: "Set up AX for automatic metrics collection",
		Long: `Set up AX for automatic metrics collection.

Connects to the AX managed service and installs Claude Code hooks
that automatically push session data after each coding session.

Use --uninstall to remove all AX hooks.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			settingsPath := hooks.DefaultSettingsPath()

			if uninstall {
				hooks.Uninstall(settingsPath)
				ui.StepDone("All AX hooks removed")
				return nil
			}

			if apiKey == "" {
				return fmt.Errorf("--api-key is required\n\n  Example: ax init --api-key <key>")
			}

			return initManagedMode(apiKey, settingsPath)
		},
	}

	cmd.Flags().BoolVar(&uninstall, "uninstall", false, "Remove all AX hooks")
	cmd.Flags().StringVar(&apiKey, "api-key", "", "API key for the AX server")

	return cmd
}

func initManagedMode(apiKey, settingsPath string) error {
	serverURL := config.DefaultServerURL

	ui.SectionHeader(ui.Bold.Render("AX Setup"))

	// Step 1: Test server connectivity
	ui.NumberedStep(1, 3, "Testing server connectivity...")
	fmt.Printf("           Server: %s\n", ui.URL.Render(serverURL))

	client := push.NewClient(serverURL, apiKey)

	if err := client.HealthCheck(); err != nil {
		ui.StepFail("Server unreachable")
		fmt.Println()
		fmt.Printf("  Could not reach the server at %s\n", ui.URL.Render(serverURL))
		fmt.Printf("  Check that:\n")
		fmt.Printf("    %s The server is running\n", ui.ArrowIcon())
		fmt.Printf("    %s Your network can reach it (VPN, firewall)\n", ui.ArrowIcon())
		return fmt.Errorf("server unreachable: %w", err)
	}
	fmt.Printf("           %s\n", ui.Success.Render("Server is reachable"))

	// Step 2: Validate API key
	fmt.Println()
	ui.NumberedStep(2, 3, "Validating API key...")

	if err := client.Ping(); err != nil {
		ui.StepFail("API key rejected")
		fmt.Println()
		fmt.Printf("  The server is reachable but the API key was rejected.\n")
		fmt.Printf("  Check that:\n")
		fmt.Printf("    %s The API key is correct\n", ui.ArrowIcon())
		fmt.Printf("    %s The key hasn't been revoked\n", ui.ArrowIcon())
		return fmt.Errorf("API key validation failed: %w", err)
	}
	fmt.Printf("           %s\n", ui.Success.Render("API key is valid"))

	// Step 3: Save config + install hooks
	fmt.Println()
	ui.NumberedStep(3, 3, "Saving configuration and installing hooks...")

	cfg := &config.Config{
		APIKey: apiKey,
	}
	if err := config.SaveConfig(cfg); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	fmt.Printf("           Saved to %s\n", ui.Code.Render("~/.ax/config.json"))

	axBinary, err := os.Executable()
	if err != nil {
		axBinary = "ax"
	}

	if hooks.IsInstalled(settingsPath) {
		ui.Step("Updating AX hooks...")
	}

	if err := hooks.Install(settingsPath, axBinary); err != nil {
		return fmt.Errorf("failed to install hooks: %w", err)
	}
	fmt.Printf("           %s SessionEnd hook installed\n", ui.SuccessIcon())

	// Success summary
	ui.CompleteBanner("Setup complete!")
	fmt.Println()
	fmt.Printf("  %s\n", ui.Bold.Render("What happens now:"))
	fmt.Printf("    %s Session data pushes automatically after each coding session\n", ui.ArrowIcon())
	fmt.Printf("    %s Your data will appear on the dashboard\n", ui.ArrowIcon())
	fmt.Println()
	fmt.Printf("  %s\n", ui.Bold.Render("Manual push:"))
	fmt.Printf("    Run %s in a git repo to push session data now.\n", ui.Code.Render("ax push --repo ."))
	fmt.Println()
	fmt.Printf("  To remove: %s\n", ui.Code.Render("ax init --uninstall"))

	return nil
}

func newPushCmd() *cobra.Command {
	var repoPath string
	var apiKey string
	var all bool
	var force bool

	cmd := &cobra.Command{
		Use:   "push",
		Short: "Push session data to the AX server",
		Long: `Push Claude Code session data to the AX managed service.

Parses session data from ~/.claude/ for the current repo and sends it
to the server. This happens automatically via hooks installed by 'ax init',
but can also be triggered manually for backfilling or debugging.

Use --all to discover and push sessions for all repos at once.
This is useful for onboarding (backfilling historical sessions) or
retrying failed pushes. The server deduplicates by session ID, so
re-pushing is safe.

Reads API key from ~/.ax/config.json (set up by 'ax init').
You can override with --api-key.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if all && repoPath != "" {
				return fmt.Errorf("--all and --repo are mutually exclusive")
			}

			if all {
				return runBulkPush(apiKey)
			}

			path, err := resolveRepoPath(repoPath)
			if err != nil {
				return err
			}

			// Load config for defaults
			cfg, _ := config.LoadConfig()
			serverURL := config.DefaultServerURL
			if apiKey == "" {
				apiKey = cfg.APIKey
			}
			if apiKey == "" {
				return fmt.Errorf("no API key configured — use --api-key or run 'ax init'")
			}

			// Determine repo identity from git remote
			owner, repo, err := gitRemoteOwnerRepo(path)
			if err != nil {
				return fmt.Errorf("could not identify repo: %w\n\n  Make sure you're in a git repo with a remote origin", err)
			}

			// Parse Claude Code sessions for this repo
			home, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("could not find home directory: %w", err)
			}
			claudeDir := filepath.Join(home, ".claude")

			sessionFiles, err := parsers.FindSessionFiles(claudeDir, path)
			if err != nil {
				return fmt.Errorf("failed to find session files: %w", err)
			}

			if len(sessionFiles) == 0 {
				ui.CompleteBanner("No session data found for this repo")
				return nil
			}

			// Filter to only new sessions unless --force is set
			ownerRepo := owner + "/" + repo
			var repoState *state.RepoState
			if !force {
				repoState, err = state.Load(ownerRepo)
				if err != nil {
					repoState = &state.RepoState{}
				}
				sessionFiles = state.FilterNewSessionFiles(sessionFiles, repoState.PushedSet())
			}

			if len(sessionFiles) == 0 {
				ui.CompleteBanner("No new sessions to push")
				return nil
			}

			// Parse sessions and build payload
			payload := &api.PushPayload{
				RepoPath: path,
				Owner:    owner,
				Repo:     repo,
			}

			var parsed int
			var pushedIDs []string
			for _, sf := range sessionFiles {
				session, err := parsers.ParseSession(sf)
				if err != nil {
					continue
				}
				parsed++
				pushedIDs = append(pushedIDs, session.ID)
				payload.Sessions = append(payload.Sessions, session.ToSessionData())
			}

			// Send to server
			client := push.NewClient(serverURL, apiKey)
			resp, err := client.Push(payload)
			if err != nil {
				return err
			}

			// Update state with successfully pushed session IDs
			if repoState == nil {
				repoState = &state.RepoState{}
			}
			repoState.AddPushed(pushedIDs)
			_ = state.Save(ownerRepo, repoState) // best-effort; push already succeeded

			ui.CompleteBanner(fmt.Sprintf("Pushed to %s", ui.URL.Render(serverURL)))
			ui.MetricRow("Repo", ui.Highlight.Render(ownerRepo))
			ui.MetricRow("Sessions", fmt.Sprintf("%d parsed, %d sent", parsed, resp.Entities["sessions"]))
			return nil
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().StringVar(&apiKey, "api-key", "", "API key (overrides config)")
	cmd.Flags().BoolVar(&all, "all", false, "Push sessions for all discovered repos")
	cmd.Flags().BoolVar(&force, "force", false, "Re-send all sessions, ignoring push history")

	return cmd
}

func runBulkPush(apiKeyOverride string) error {
	// Load config for defaults.
	cfg, _ := config.LoadConfig()
	serverURL := config.DefaultServerURL
	key := apiKeyOverride
	if key == "" {
		key = cfg.APIKey
	}
	if key == "" {
		return fmt.Errorf("no API key configured — use --api-key or run 'ax init'")
	}

	// Health check.
	client := push.NewClient(serverURL, key)
	if err := client.HealthCheck(); err != nil {
		return fmt.Errorf("server unreachable at %s: %w", serverURL, err)
	}

	// Discover repos.
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("could not find home directory: %w", err)
	}
	claudeDir := filepath.Join(home, ".claude")

	ui.SectionHeader("Discovering repos...")
	summary, err := bulk.DiscoverRepos(claudeDir, gitRemoteOwnerRepo)
	if err != nil {
		return fmt.Errorf("discovery failed: %w", err)
	}

	if len(summary.Repos) == 0 {
		ui.CompleteBanner("No pushable repos found")
		if len(summary.SkippedPaths) > 0 {
			fmt.Printf("\n  %s %d project paths skipped (no git remote or missing directory)\n",
				ui.WarningIcon(), len(summary.SkippedPaths))
		}
		return nil
	}

	// Sort repos by name for consistent display.
	sort.Slice(summary.Repos, func(i, j int) bool {
		return summary.Repos[i].OwnerRepo < summary.Repos[j].OwnerRepo
	})

	if len(summary.SkippedPaths) > 0 {
		fmt.Printf("\n  %s %d %s skipped (no git remote or missing directory)\n",
			ui.WarningIcon(),
			len(summary.SkippedPaths),
			pluralize(len(summary.SkippedPaths), "path", "paths"))
	}

	// Interactive repo selection via multi-select.
	options := make([]huh.Option[int], len(summary.Repos))
	for i, r := range summary.Repos {
		label := fmt.Sprintf("%-35s %s",
			r.OwnerRepo,
			ui.Faint.Render(fmt.Sprintf("%d sessions", len(r.SessionFiles))))
		options[i] = huh.NewOption(label, i).Selected(true)
	}

	var selectedIndices []int
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewMultiSelect[int]().
				Title(fmt.Sprintf("Bulk Push — %d %s, %d sessions",
					len(summary.Repos),
					pluralize(len(summary.Repos), "repo", "repos"),
					summary.TotalSessions)).
				Description("Space to toggle, Enter to confirm").
				Options(options...).
				Value(&selectedIndices),
		),
	)

	if err := form.Run(); err != nil {
		fmt.Println("  Aborted.")
		return nil
	}

	if len(selectedIndices) == 0 {
		fmt.Println("  No repos selected. Aborted.")
		return nil
	}

	selectedRepos := make([]bulk.DiscoveredRepo, len(selectedIndices))
	for i, idx := range selectedIndices {
		selectedRepos[i] = summary.Repos[idx]
	}
	summary.Repos = selectedRepos

	fmt.Println()

	// Execute bulk push.
	result := bulk.BulkPush(&bulk.BulkPushConfig{
		Client:      client,
		Repos:       summary.Repos,
		Concurrency: bulk.DefaultConcurrency,
		Writer:      os.Stdout,
	})

	// Summary.
	if result.ReposFailed == 0 {
		ui.CompleteBanner("Bulk Push Complete")
	} else {
		ui.FailBanner("Bulk Push Complete (with errors)")
	}
	fmt.Println()

	if result.ReposFailed == 0 {
		ui.MetricRow("Repos", fmt.Sprintf("%d pushed", result.ReposPushed))
	} else {
		ui.MetricRow("Repos", fmt.Sprintf("%d pushed, %s",
			result.ReposPushed,
			ui.Error.Render(fmt.Sprintf("%d failed", result.ReposFailed))))
	}

	if result.TotalFailed == 0 {
		ui.MetricRow("Sessions", fmt.Sprintf("%d sent", result.TotalSent))
	} else {
		ui.MetricRow("Sessions", fmt.Sprintf("%d sent, %s",
			result.TotalSent,
			ui.Error.Render(fmt.Sprintf("%d failed", result.TotalFailed))))
	}

	// Write error log if there were failures.
	if result.ReposFailed > 0 {
		logPath, err := bulk.WriteErrorLog(result)
		if err != nil {
			fmt.Printf("\n  %s Could not write error log: %v\n", ui.WarningIcon(), err)
		} else {
			fmt.Println()
			fmt.Printf("  %s Errors written to %s\n", ui.ErrorIcon(), ui.Code.Render(logPath))
			fmt.Printf("    Review the log and retry individual repos with: %s\n", ui.Code.Render("ax push --repo <path>"))
		}
	}

	return nil
}

func pluralize(n int, singular, plural string) string {
	if n == 1 {
		return singular
	}
	return plural
}

func init() {
	log.SetFlags(0)
	log.SetPrefix("ax: ")
}
