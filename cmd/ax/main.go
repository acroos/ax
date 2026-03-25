// Package main is the entry point for the ax CLI.
// ax measures developer experience for agentic coding workflows.
package main

import (
	"fmt"
	"os"

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

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newSyncCmd() *cobra.Command {
	var repoPath string
	var since string

	cmd := &cobra.Command{
		Use:   "sync",
		Short: "Ingest data from git, GitHub, and Claude Code sessions",
		Long:  "Sync analyzes a repository's git history, fetches PR data from GitHub,\nand optionally parses Claude Code session data to compute metrics.",
		RunE: func(cmd *cobra.Command, args []string) error {
			if repoPath == "" {
				cwd, err := os.Getwd()
				if err != nil {
					return fmt.Errorf("failed to get working directory: %w", err)
				}
				repoPath = cwd
			}
			fmt.Printf("Syncing repo: %s\n", repoPath)
			if since != "" {
				fmt.Printf("Since: %s\n", since)
			}
			// TODO: implement sync orchestration
			fmt.Println("Sync not yet implemented.")
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
			if repoPath == "" {
				cwd, err := os.Getwd()
				if err != nil {
					return fmt.Errorf("failed to get working directory: %w", err)
				}
				repoPath = cwd
			}
			fmt.Printf("Report for: %s\n", repoPath)
			if prNumber > 0 {
				fmt.Printf("PR: #%d\n", prNumber)
			}
			// TODO: implement report
			fmt.Println("Report not yet implemented.")
			return nil
		},
	}

	cmd.Flags().StringVar(&repoPath, "repo", "", "Path to the git repository (defaults to current directory)")
	cmd.Flags().IntVar(&prNumber, "pr", 0, "Show metrics for a specific PR number")

	return cmd
}

func newStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show tracked repos and last sync time",
		RunE: func(cmd *cobra.Command, args []string) error {
			// TODO: implement status
			fmt.Println("Status not yet implemented.")
			return nil
		},
	}
}
