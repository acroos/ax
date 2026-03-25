package db

import "database/sql"

// migratePostgres runs all PostgreSQL schema migrations.
func migratePostgres(database *sql.DB) error {
	// Create migrations tracking table
	if _, err := database.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TIMESTAMP NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return err
	}

	for _, m := range postgresMigrations {
		var exists bool
		err := database.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)", m.version).Scan(&exists)
		if err != nil {
			return err
		}
		if exists {
			continue
		}

		tx, err := database.Begin()
		if err != nil {
			return err
		}

		if _, err := tx.Exec(m.sql); err != nil {
			tx.Rollback()
			return err
		}

		if _, err := tx.Exec("INSERT INTO schema_migrations (version) VALUES ($1)", m.version); err != nil {
			tx.Rollback()
			return err
		}

		if err := tx.Commit(); err != nil {
			return err
		}
	}

	return nil
}

var postgresMigrations = []migration{
	{
		version: 1,
		sql: `
			CREATE TABLE repos (
				id SERIAL PRIMARY KEY,
				path TEXT NOT NULL UNIQUE,
				remote_url TEXT,
				github_owner TEXT,
				github_repo TEXT,
				last_synced_at TIMESTAMP,
				created_at TIMESTAMP NOT NULL DEFAULT NOW()
			);

			CREATE TABLE sessions (
				id TEXT PRIMARY KEY,
				repo_id INTEGER REFERENCES repos(id),
				branch TEXT,
				started_at BIGINT,
				ended_at BIGINT,
				message_count INTEGER DEFAULT 0,
				turn_count INTEGER DEFAULT 0,
				cwd TEXT,
				input_tokens INTEGER DEFAULT 0,
				output_tokens INTEGER DEFAULT 0,
				cache_creation_input_tokens INTEGER DEFAULT 0,
				cache_read_input_tokens INTEGER DEFAULT 0,
				total_cost_usd DOUBLE PRECISION,
				primary_model TEXT,
				pushed_by TEXT
			);

			CREATE TABLE prs (
				id SERIAL PRIMARY KEY,
				repo_id INTEGER NOT NULL REFERENCES repos(id),
				number INTEGER NOT NULL,
				title TEXT,
				branch TEXT,
				state TEXT,
				previous_state TEXT,
				created_at TEXT,
				merged_at TEXT,
				closed_at TEXT,
				url TEXT,
				additions INTEGER DEFAULT 0,
				deletions INTEGER DEFAULT 0,
				changed_files INTEGER DEFAULT 0,
				pushed_by TEXT,
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
				ci_success_rate DOUBLE PRECISION,
				diff_churn_lines INTEGER,
				has_tests INTEGER,
				line_revisit_rate DOUBLE PRECISION,
				plan_coverage_score DOUBLE PRECISION,
				plan_deviation_score DOUBLE PRECISION,
				scope_creep_detected INTEGER,
				self_correction_rate DOUBLE PRECISION,
				context_efficiency DOUBLE PRECISION,
				error_recovery_attempts INTEGER,
				token_cost_usd DOUBLE PRECISION,
				metrics_finalized INTEGER DEFAULT 0,
				finalized_at TIMESTAMP,
				computed_at TIMESTAMP NOT NULL DEFAULT NOW()
			);

			CREATE TABLE plan_analyses (
				id SERIAL PRIMARY KEY,
				pr_id INTEGER REFERENCES prs(id),
				plan_file TEXT,
				coverage_score DOUBLE PRECISION,
				deviation_score DOUBLE PRECISION,
				scope_creep_detected INTEGER DEFAULT 0,
				planned_files TEXT,
				actual_files TEXT,
				analysis_json TEXT,
				created_at TIMESTAMP NOT NULL DEFAULT NOW()
			);

			CREATE TABLE repo_metrics (
				id SERIAL PRIMARY KEY,
				repo_id INTEGER NOT NULL REFERENCES repos(id),
				period_start TEXT NOT NULL,
				period_end TEXT NOT NULL,
				period_type TEXT NOT NULL,
				total_sessions INTEGER DEFAULT 0,
				total_tokens INTEGER DEFAULT 0,
				total_cost_usd DOUBLE PRECISION DEFAULT 0,
				unmerged_tokens INTEGER DEFAULT 0,
				unmerged_cost_usd DOUBLE PRECISION DEFAULT 0,
				unmerged_rate DOUBLE PRECISION,
				computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
				UNIQUE(repo_id, period_start, period_type)
			);

			CREATE TABLE watched_repos (
				repo_id INTEGER PRIMARY KEY REFERENCES repos(id),
				poll_interval_seconds INTEGER DEFAULT 300,
				last_polled_at TIMESTAMP,
				enabled INTEGER DEFAULT 1
			);

			CREATE TABLE api_keys (
				id SERIAL PRIMARY KEY,
				key_hash TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT NOW(),
				last_used_at TIMESTAMP,
				revoked INTEGER DEFAULT 0
			);

			CREATE INDEX idx_commits_repo ON commits(repo_id);
			CREATE INDEX idx_commits_pr ON commits(pr_id);
			CREATE INDEX idx_prs_repo ON prs(repo_id);
			CREATE INDEX idx_sessions_repo ON sessions(repo_id);
			CREATE INDEX idx_repo_metrics_repo ON repo_metrics(repo_id);
		`,
	},
}
