# Data Model

AX uses PostgreSQL for the managed service. The schema covers data tables, identity, org, and auth tables.

## Core Tables

### repos
Repository container. One row per tracked repo.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| path | text | Identifier |
| remote_url | text | Git remote origin URL |
| github_owner | text | Extracted from remote (e.g., "acroos") |
| github_repo | text | Extracted from remote (e.g., "ax") |
| last_synced_at | timestamp | Last successful data push |
| organization_id | bigint | FK → organizations |
| github_installation_id | bigint | FK → github_installations |

### prs
Pull requests. Unique per (repo_id, number).

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| repo_id | bigint | FK → repos |
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
| repo_id | bigint | FK → repos |
| pr_id | bigint | FK → prs (nullable) |
| session_id | text | FK → sessions (nullable) |
| message | text | Commit message |
| author | text | |
| committed_at | timestamp | |
| is_claude_authored | boolean | Detected via "Co-Authored-By: Claude" in message |
| is_post_open | boolean | Committed after PR was opened |
| additions | integer | |
| deletions | integer | |
| files_changed | integer | |
| ci_passed | boolean | Whether all check suites passed for this commit. Set by `GithubDataFetcher` (at finalization) or `CiCompleted` webhook handler (real-time). |

### sessions
Claude Code sessions. PK is `id` (UUID string from session file).

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK (UUID from Claude Code) |
| repo_id | bigint | FK → repos |
| branch | text | Working branch during session |
| started_at | timestamp | |
| ended_at | timestamp | |
| message_count | integer | Human messages only (mapped from `session.HumanMessages` in Go CLI) |
| turn_count | integer | Human turns only |
| input_tokens | integer | |
| output_tokens | integer | |
| cache_creation_input_tokens | integer | |
| cache_read_input_tokens | integer | |
| total_cost_usd | real | Computed via model-specific pricing |
| primary_model | text | Majority model used |
| cwd | text | Working directory |
| pushed_by | text | Who pushed this data |
| files_read_count | integer | Unique files read |
| files_modified_count | integer | Unique files modified |
| assistant_message_count | integer | Assistant messages in session |
| sidechain_messages | integer | Messages on sidechain branches |
| total_file_reads | integer | Total Read tool invocations |

### session_prs
Many-to-many join: sessions to PRs, with correlation confidence.

| Column | Type | Notes |
|--------|------|-------|
| session_id | text | FK → sessions |
| pr_id | bigint | FK → prs |
| confidence | text | direct, branch, commit, or heuristic |

Unique on (session_id, pr_id).

### pr_files
File paths changed in a PR. Fetched from the GitHub API at PR finalization (merge/close). Used for test detection and line revisit rate computation.

| Column | Type | Notes |
|--------|------|-------|
| id | integer | PK |
| pr_id | integer | FK → prs |
| filename | text | File path relative to repo root |
| additions | integer | Lines added in this file |
| deletions | integer | Lines removed in this file |
| line_changes | integer | Total line changes (additions + deletions) |
| status | text | added, modified, removed, renamed |

Unique on (pr_id, filename).

### pr_metrics
10 computed PR-level metrics. One row per PR.

| Column | Type | Notes |
|--------|------|-------|
| pr_id | bigint | PK / unique FK → prs |
| iteration_depth | integer | Human-agent turn pairs |
| post_open_commits | integer | |
| ci_success_rate | real | 0.0 to 1.0. Computed from per-commit `ci_passed` values on the `commits` table. Updatable after finalization (not in `GITHUB_DERIVED_FIELDS`). |
| line_revisit_rate | real | |
| token_cost_usd | real | |
| cache_hit_rate | real | Cache-read tokens / total input tokens |
| sidechain_rate | real | Sidechain messages / total messages |
| re_read_rate | real | Total file reads / unique files read |
| autonomy_score | real | Assistant messages / human messages |
| metrics_finalized | boolean | Write-lock flag |
| finalized_at | timestamp | When metrics were locked |

See [Metrics — Finalization](metrics.md#finalization) for immutability rules.

## Identity & Auth Tables

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
| plan | text | "free" or "pro" (default: "free") |
| stripe_customer_id | text | Stripe customer ID (nullable, unique) |
| plan_overrides | jsonb | Per-org capability overrides (default: {}) |

### subscriptions
Stripe subscription sync record. One per org (when on a paid plan).

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| organization_id | bigint | FK → organizations |
| stripe_subscription_id | text | Unique, from Stripe |
| stripe_subscription_item_id | text | Stripe `SubscriptionItem` ID — required to update seat quantity |
| status | text | active, canceled, past_due, trialing, etc. |
| quantity | integer | Purchased seat count (default: 1, source of truth for `max_members` on Pro) |
| current_period_start | timestamp | |
| current_period_end | timestamp | |
| cancel_at_period_end | boolean | Cancellation scheduled |
| canceled_at | timestamp | |

### processed_stripe_events
Idempotency guard for Stripe webhook processing. One row per Stripe event ID, inserted via upsert before handling.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| event_id | text | Stripe event ID (unique index) |
| created_at | timestamp | |

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

### teams
Teams within an organization. Supports hierarchy via optional parent team.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| organization_id | bigint | FK → organizations |
| name | text | Display name |
| slug | text | URL-safe, unique within org |
| parent_team_id | bigint | FK → teams (nullable, self-referential) |
| created_by_id | bigint | FK → users |

Index on (organization_id, slug).

### team_memberships
Join table between teams and org memberships.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| team_id | bigint | FK → teams |
| org_membership_id | bigint | FK → org_memberships |

Unique on (team_id, org_membership_id).

### api_keys

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| user_id | bigint | Unique FK → users |
| key_hash | text | bcrypt hash of `ax_k1_<hex>` |
| key_digest | text | SHA-256 hex digest for O(1) lookup (unique index) |
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
- `solid_queue_*`, `solid_cache_entries` — Framework tables (job queue, cache)

## Schema Management

- **PostgreSQL**: Rails migrations in `server/db/migrate/`. Standard `rails db:migrate`. Currently ~20 migrations.
