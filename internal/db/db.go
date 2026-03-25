// Package db manages the SQLite database for ax.
// It handles connection setup, schema migrations, and provides
// the database handle used by all other packages.
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

// DefaultDBPath returns the default database path (~/.ax/ax.db).
func DefaultDBPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(home, ".ax", "ax.db"), nil
}

// Open opens (or creates) the SQLite database at the given path,
// runs migrations, and returns a ready-to-use database handle.
func Open(dbPath string) (*sqlx.DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	db, err := sqlx.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	if err := migrate(db.DB); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

// migrate runs all pending schema migrations.
func migrate(db *sql.DB) error {
	// Create migrations tracking table
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	for _, m := range migrations {
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?)", m.version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check migration %d: %w", m.version, err)
		}
		if exists {
			continue
		}

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("failed to begin transaction for migration %d: %w", m.version, err)
		}

		if _, err := tx.Exec(m.sql); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to run migration %d: %w", m.version, err)
		}

		if _, err := tx.Exec("INSERT INTO schema_migrations (version) VALUES (?)", m.version); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to record migration %d: %w", m.version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %d: %w", m.version, err)
		}
	}

	return nil
}

type migration struct {
	version int
	sql     string
}

var migrations = []migration{
	{
		version: 1,
		sql: `
			CREATE TABLE repos (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				path TEXT NOT NULL UNIQUE,
				remote_url TEXT,
				github_owner TEXT,
				github_repo TEXT,
				last_synced_at TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE TABLE sessions (
				id TEXT PRIMARY KEY,
				repo_id INTEGER REFERENCES repos(id),
				branch TEXT,
				started_at INTEGER,
				ended_at INTEGER,
				message_count INTEGER DEFAULT 0,
				turn_count INTEGER DEFAULT 0,
				cwd TEXT
			);

			CREATE TABLE prs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				repo_id INTEGER NOT NULL REFERENCES repos(id),
				number INTEGER NOT NULL,
				title TEXT,
				branch TEXT,
				state TEXT,
				created_at TEXT,
				merged_at TEXT,
				closed_at TEXT,
				url TEXT,
				additions INTEGER DEFAULT 0,
				deletions INTEGER DEFAULT 0,
				changed_files INTEGER DEFAULT 0,
				UNIQUE(repo_id, number)
			);

			CREATE TABLE commits (
				sha TEXT PRIMARY KEY,
				repo_id INTEGER NOT NULL REFERENCES repos(id),
				pr_id INTEGER REFERENCES prs(id),
				session_id TEXT REFERENCES sessions(id),
				message TEXT,
				author TEXT,
				committed_at TEXT,
				is_claude_authored INTEGER DEFAULT 0,
				is_post_open INTEGER DEFAULT 0,
				additions INTEGER DEFAULT 0,
				deletions INTEGER DEFAULT 0,
				files_changed INTEGER DEFAULT 0
			);

			CREATE TABLE session_prs (
				session_id TEXT NOT NULL REFERENCES sessions(id),
				pr_id INTEGER NOT NULL REFERENCES prs(id),
				confidence TEXT NOT NULL,
				PRIMARY KEY (session_id, pr_id)
			);

			CREATE TABLE pr_metrics (
				pr_id INTEGER PRIMARY KEY REFERENCES prs(id),
				messages_per_pr INTEGER,
				iteration_depth INTEGER,
				post_open_commits INTEGER,
				first_pass_accepted INTEGER,
				ci_success_rate REAL,
				diff_churn_lines INTEGER,
				has_tests INTEGER,
				line_revisit_rate REAL,
				plan_coverage_score REAL,
				plan_deviation_score REAL,
				scope_creep_detected INTEGER,
				self_correction_rate REAL,
				context_efficiency REAL,
				error_recovery_attempts INTEGER,
				computed_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE TABLE plan_analyses (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				pr_id INTEGER REFERENCES prs(id),
				plan_file TEXT,
				coverage_score REAL,
				deviation_score REAL,
				scope_creep_detected INTEGER DEFAULT 0,
				planned_files TEXT,
				actual_files TEXT,
				analysis_json TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE INDEX idx_commits_repo ON commits(repo_id);
			CREATE INDEX idx_commits_pr ON commits(pr_id);
			CREATE INDEX idx_prs_repo ON prs(repo_id);
			CREATE INDEX idx_sessions_repo ON sessions(repo_id);
		`,
	},
	{
		version: 2,
		sql: `
			-- Add token tracking to sessions
			ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0;
			ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0;
			ALTER TABLE sessions ADD COLUMN cache_creation_input_tokens INTEGER DEFAULT 0;
			ALTER TABLE sessions ADD COLUMN cache_read_input_tokens INTEGER DEFAULT 0;
			ALTER TABLE sessions ADD COLUMN total_cost_usd REAL;
			ALTER TABLE sessions ADD COLUMN primary_model TEXT;

			-- Add token cost to pr_metrics
			ALTER TABLE pr_metrics ADD COLUMN token_cost_usd REAL;

			-- New repo-level metrics table for aggregate metrics like unmerged token spend
			CREATE TABLE repo_metrics (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				repo_id INTEGER NOT NULL REFERENCES repos(id),
				period_start TEXT NOT NULL,
				period_end TEXT NOT NULL,
				period_type TEXT NOT NULL,
				total_sessions INTEGER DEFAULT 0,
				total_tokens INTEGER DEFAULT 0,
				total_cost_usd REAL DEFAULT 0,
				unmerged_tokens INTEGER DEFAULT 0,
				unmerged_cost_usd REAL DEFAULT 0,
				unmerged_rate REAL,
				computed_at TEXT NOT NULL DEFAULT (datetime('now')),
				UNIQUE(repo_id, period_start, period_type)
			);

			CREATE INDEX idx_repo_metrics_repo ON repo_metrics(repo_id);
		`,
	},
}
