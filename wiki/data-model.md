# Data Model

AX uses two databases: SQLite for local mode and PostgreSQL for managed mode. They share the same logical schema for data tables, but the Rails database adds identity, org, and auth tables.

## Core Tables (Both Databases)

### repos
Repository container. One row per tracked repo.

| Column | Type | Notes |
|--------|------|-------|
| id | integer | PK (auto-increment in SQLite, serial in PG) |
| path | text | Unique. Absolute path or identifier. |
| remote_url | text | Git remote origin URL |
| github_owner | text | Extracted from remote (e.g., "acroos") |
| github_repo | text | Extracted from remote (e.g., "ax") |
| last_synced_at | timestamp | Last successful sync |

Rails adds: `organization_id`, `github_installation_id`

### prs
Pull requests. Unique per (repo_id, number).

| Column | Type | Notes |
|--------|------|-------|
| id | integer | PK |
| repo_id | integer | FK → repos |
| number | integer | PR number on GitHub |
| title | text | |
| branch | text | Head branch name |
| state | text | open, merged, closed |
| previous_state | text | For detecting transitions |
| author | text | GitHub username |
| created_at | timestamp | PR creation time on GitHub |
| merged_at | timestamp | Nullable |
| closed_at | timestamp | Nullable |
| additions | integer | Total lines added |
| deletions | integer | Total lines removed |
| changed_files | integer | |
| open_commit_count | integer | Commits at time of PR open (for post-open calculation) |

### commits
Git commits. PK is `sha` (not auto-increment).

| Column | Type | Notes |
|--------|------|-------|
| sha | text | PK |
| repo_id | integer | FK → repos |
| pr_id | integer | FK → prs (nullable) |
| session_id | text | FK → sessions (nullable) |
| message | text | Commit message |
| author | text | |
| committed_at | timestamp | |
| is_claude_authored | boolean | Detected via "Co-Authored-By: Claude" in message |
| is_post_open | boolean | Committed after PR was opened |
| additions | integer | |
| deletions | integer | |
| files_changed | integer | |

### sessions
Claude Code sessions. PK is `id` (UUID string from session file).

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK (UUID from Claude Code) |
| repo_id | integer | FK → repos |
| branch | text | Working branch during session |
| started_at | timestamp | |
| ended_at | timestamp | |
| message_count | integer | Human + assistant messages |
| turn_count | integer | Human turns only |
| input_tokens | integer | |
| output_tokens | integer | |
| cache_creation_input_tokens | integer | |
| cache_read_input_tokens | integer | |
| total_cost_usd | real | Computed via model-specific pricing |
| primary_model | text | Majority model used |

Rails adds: `cwd`, `pushed_by`

### session_prs
Many-to-many join: sessions to PRs, with correlation confidence.

| Column | Type | Notes |
|--------|------|-------|
| session_id | text | FK → sessions |
| pr_id | integer | FK → prs |
| confidence | text | direct, branch, commit, or heuristic |

Unique on (session_id, pr_id).

### pr_metrics
All 16 computed metrics per PR. One row per PR.

| Column | Type | Notes |
|--------|------|-------|
| pr_id | integer | PK / unique FK → prs |
| messages_per_pr | integer | |
| iteration_depth | integer | |
| post_open_commits | integer | |
| first_pass_accepted | boolean | |
| ci_success_rate | real | 0.0 to 1.0 |
| diff_churn_lines | integer | |
| has_tests | boolean | |
| line_revisit_rate | real | |
| self_correction_rate | real | |
| context_efficiency | real | |
| error_recovery_attempts | integer | |
| token_cost_usd | real | |
| plan_coverage_score | real | |
| plan_deviation_score | real | |
| scope_creep_detected | boolean | |
| metrics_finalized | boolean | Write-lock flag |
| finalized_at | timestamp | When metrics were locked |

See [Metrics — Finalization](metrics.md#finalization) for immutability rules.

### repo_metrics
Repo-level aggregates, computed per period.

| Column | Type | Notes |
|--------|------|-------|
| id | integer | PK |
| repo_id | integer | FK → repos |
| period_start | timestamp | |
| period_end | timestamp | |
| period_type | text | Currently always "all" |
| total_sessions | integer | |
| total_tokens | integer | |
| total_cost_usd | real | |
| unmerged_tokens | integer | Tokens on never-merged PRs |
| unmerged_cost_usd | real | Dollar waste |
| unmerged_rate | real | unmerged_cost / total_cost |

Unique on (repo_id, period_start, period_type).

### watched_repos
Tracks which repos are being polled for PR state changes.

| Column | Type | Notes |
|--------|------|-------|
| repo_id | integer | PK / unique FK → repos |
| poll_interval_seconds | integer | Default 300 |
| last_polled_at | timestamp | |
| enabled | boolean | Default true |

## Rails-Only Tables

These exist only in PostgreSQL for the managed service.

### users
GitHub OAuth identity (Devise).

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| github_id | integer | Unique |
| github_username | text | |
| email | text | |
| display_name | text | |
| avatar_url | text | |
| last_login_at | timestamp | |

### organizations

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| slug | text | Unique, URL-safe identifier |
| name | text | Display name |
| created_by_id | bigint | FK → users |
| is_personal | boolean | Auto-created personal orgs |

### org_memberships

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| organization_id | bigint | FK → organizations |
| user_id | bigint | FK → users |
| role | text | owner, admin, or member |
| invited_by_id | bigint | FK → users (nullable) |
| joined_at | timestamp | |

Unique on (organization_id, user_id).

### api_keys

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| user_id | bigint | Unique FK → users |
| key_hash | text | bcrypt hash of `ax_k1_<hex>` |
| name | text | |
| revoked | boolean | |
| last_used_at | timestamp | |

### user_sessions

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| user_id | bigint | FK → users |
| session_token | text | Unique |
| expires_at | timestamp | 30 days from creation |
| user_agent | text | |
| ip_address | text | |

### invites

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| organization_id | bigint | FK → organizations |
| github_username | text | Invitee |
| role | text | Role to assign on acceptance |
| token | text | Unique, URL-safe |
| status | text | pending, accepted, expired, revoked |
| invited_by_id | bigint | FK → users |
| expires_at | timestamp | 7 days from creation |
| accepted_at | timestamp | |

### github_installations

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| organization_id | bigint | FK → organizations |
| github_installation_id | integer | From GitHub |
| account_login | text | |
| status | text | active, suspended, deleted |
| permissions | jsonb | |
| events | jsonb | |

### Other
- `waitlist_entries` — Early access management (email, status)
- `plan_analyses` — Plan-to-implementation comparison data
- `solid_queue_*`, `solid_cache_entries` — Framework tables (job queue, cache)

## Schema Management

- **SQLite**: Versioned migrations in `internal/db/db.go`. Applied on database open. Currently 6 migrations.
- **PostgreSQL**: Rails migrations in `server/db/migrate/`. Standard `rails db:migrate`. Currently ~20 migrations.

Both databases use the same column names and types for shared tables, making the push payload a straightforward mapping.
