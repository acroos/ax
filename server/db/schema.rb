# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_21_000001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "api_keys", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key_digest"
    t.string "key_hash", null: false
    t.datetime "last_used_at"
    t.string "name"
    t.boolean "revoked", default: false, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["key_digest"], name: "index_api_keys_on_key_digest", unique: true
    t.index ["user_id"], name: "index_api_keys_on_user_id"
  end

  create_table "commits", primary_key: "sha", id: :string, force: :cascade do |t|
    t.integer "additions", default: 0
    t.string "author"
    t.boolean "ci_passed"
    t.datetime "committed_at"
    t.datetime "created_at", null: false
    t.integer "deletions", default: 0
    t.integer "files_changed", default: 0
    t.boolean "is_claude_authored", default: false
    t.boolean "is_post_open", default: false
    t.string "message"
    t.bigint "pr_id"
    t.bigint "repo_id", null: false
    t.string "session_id"
    t.datetime "updated_at", null: false
    t.index ["pr_id"], name: "index_commits_on_pr_id"
    t.index ["repo_id"], name: "index_commits_on_repo_id"
    t.index ["session_id"], name: "index_commits_on_session_id"
  end

  create_table "github_installations", force: :cascade do |t|
    t.string "account_login", null: false
    t.string "account_type", null: false
    t.datetime "created_at", null: false
    t.jsonb "events", default: [], null: false
    t.bigint "github_installation_id", null: false
    t.datetime "installed_at"
    t.bigint "installed_by_id"
    t.datetime "last_synced_at"
    t.bigint "organization_id"
    t.jsonb "permissions", default: {}, null: false
    t.string "repository_selection", null: false
    t.string "status", default: "active", null: false
    t.string "target_type", null: false
    t.datetime "updated_at", null: false
    t.string "webhook_secret"
    t.index ["github_installation_id"], name: "index_github_installations_on_github_installation_id", unique: true
    t.index ["installed_by_id"], name: "index_github_installations_on_installed_by_id"
    t.index ["organization_id"], name: "index_github_installations_on_organization_id"
  end

  create_table "invites", force: :cascade do |t|
    t.datetime "accepted_at"
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "github_username", null: false
    t.bigint "invited_by_id", null: false
    t.bigint "organization_id", null: false
    t.string "role", null: false
    t.string "status", default: "pending", null: false
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.index ["github_username"], name: "index_invites_on_github_username"
    t.index ["invited_by_id"], name: "index_invites_on_invited_by_id"
    t.index ["organization_id", "github_username", "status"], name: "idx_on_organization_id_github_username_status_2150455612", unique: true
    t.index ["organization_id"], name: "index_invites_on_organization_id"
    t.index ["token"], name: "index_invites_on_token", unique: true
  end

  create_table "org_memberships", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "invited_by_id"
    t.datetime "joined_at", default: -> { "now()" }, null: false
    t.bigint "organization_id", null: false
    t.string "role", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["invited_by_id"], name: "index_org_memberships_on_invited_by_id"
    t.index ["organization_id", "user_id"], name: "index_org_memberships_on_organization_id_and_user_id", unique: true
    t.index ["organization_id"], name: "index_org_memberships_on_organization_id"
    t.index ["user_id"], name: "index_org_memberships_on_user_id"
  end

  create_table "organizations", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "created_by_id", null: false
    t.boolean "is_personal", default: false, null: false
    t.string "name", null: false
    t.string "plan", default: "free", null: false
    t.jsonb "plan_overrides", default: {}, null: false
    t.string "slug", null: false
    t.string "stripe_customer_id"
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_organizations_on_created_by_id"
    t.index ["slug"], name: "index_organizations_on_slug", unique: true
    t.index ["stripe_customer_id"], name: "index_organizations_on_stripe_customer_id", unique: true, where: "(stripe_customer_id IS NOT NULL)"
  end

  create_table "pr_files", force: :cascade do |t|
    t.integer "additions", default: 0
    t.datetime "created_at", null: false
    t.integer "deletions", default: 0
    t.string "filename", null: false
    t.integer "line_changes", default: 0
    t.bigint "pr_id", null: false
    t.string "status"
    t.datetime "updated_at", null: false
    t.index ["pr_id", "filename"], name: "index_pr_files_on_pr_id_and_filename", unique: true
    t.index ["pr_id"], name: "index_pr_files_on_pr_id"
  end

  create_table "pr_metrics", force: :cascade do |t|
    t.float "autonomy_score"
    t.float "cache_hit_rate"
    t.float "ci_success_rate"
    t.datetime "computed_at", default: -> { "now()" }, null: false
    t.datetime "created_at", null: false
    t.datetime "finalized_at"
    t.integer "iteration_depth"
    t.float "line_revisit_rate"
    t.boolean "metrics_finalized", default: false
    t.integer "post_open_commits"
    t.bigint "pr_id", null: false
    t.float "re_read_rate"
    t.float "sidechain_rate"
    t.float "token_cost_usd"
    t.datetime "updated_at", null: false
    t.index ["pr_id"], name: "index_pr_metrics_on_pr_id", unique: true
  end

  create_table "processed_github_events", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "event_id", null: false
    t.datetime "updated_at", null: false
    t.index ["event_id"], name: "index_processed_github_events_on_event_id", unique: true
  end

  create_table "processed_stripe_events", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "event_id", null: false
    t.datetime "updated_at", null: false
    t.index ["event_id"], name: "index_processed_stripe_events_on_event_id", unique: true
  end

  create_table "prs", force: :cascade do |t|
    t.integer "additions", default: 0
    t.string "author"
    t.string "branch"
    t.integer "changed_files", default: 0
    t.datetime "closed_at"
    t.datetime "created_at", null: false
    t.datetime "created_at_source"
    t.integer "deletions", default: 0
    t.datetime "merged_at"
    t.integer "number", null: false
    t.integer "open_commit_count"
    t.string "previous_state"
    t.string "pushed_by"
    t.bigint "repo_id", null: false
    t.string "state"
    t.string "title"
    t.datetime "updated_at", null: false
    t.string "url"
    t.index "COALESCE(merged_at, closed_at)", name: "index_prs_on_terminal_date"
    t.index ["author"], name: "index_prs_on_author"
    t.index ["closed_at"], name: "index_prs_on_closed_at"
    t.index ["merged_at"], name: "index_prs_on_merged_at"
    t.index ["repo_id", "number"], name: "index_prs_on_repo_id_and_number", unique: true
    t.index ["repo_id"], name: "index_prs_on_repo_id"
  end

  create_table "repos", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "github_installation_id"
    t.string "github_owner"
    t.string "github_repo"
    t.datetime "last_synced_at"
    t.bigint "organization_id"
    t.string "path"
    t.string "remote_url"
    t.datetime "updated_at", null: false
    t.index ["github_installation_id"], name: "index_repos_on_github_installation_id"
    t.index ["organization_id", "github_owner", "github_repo"], name: "index_repos_on_org_github_identity", unique: true
    t.index ["organization_id"], name: "index_repos_on_organization_id"
    t.index ["path"], name: "index_repos_on_path"
  end

  create_table "session_prs", force: :cascade do |t|
    t.string "confidence", null: false
    t.datetime "created_at", null: false
    t.bigint "pr_id", null: false
    t.string "session_id", null: false
    t.datetime "updated_at", null: false
    t.index ["pr_id"], name: "index_session_prs_on_pr_id"
    t.index ["session_id", "pr_id"], name: "index_session_prs_on_session_id_and_pr_id", unique: true
  end

  create_table "sessions", id: :string, force: :cascade do |t|
    t.integer "assistant_message_count", default: 0, null: false
    t.string "branch"
    t.integer "cache_creation_input_tokens", default: 0
    t.integer "cache_read_input_tokens", default: 0
    t.datetime "created_at", null: false
    t.string "cwd"
    t.datetime "ended_at"
    t.integer "files_modified_count", default: 0
    t.integer "files_read_count", default: 0
    t.integer "input_tokens", default: 0
    t.integer "message_count", default: 0
    t.integer "output_tokens", default: 0
    t.string "primary_model"
    t.string "pushed_by"
    t.bigint "repo_id"
    t.integer "sidechain_messages", default: 0, null: false
    t.datetime "started_at"
    t.float "total_cost_usd"
    t.integer "total_file_reads", default: 0, null: false
    t.integer "turn_count", default: 0
    t.datetime "updated_at", null: false
    t.index ["repo_id"], name: "index_sessions_on_repo_id"
  end

  create_table "solid_cache_entries", force: :cascade do |t|
    t.integer "byte_size", null: false
    t.datetime "created_at", null: false
    t.binary "key", null: false
    t.bigint "key_hash", null: false
    t.binary "value", null: false
    t.index ["byte_size"], name: "index_solid_cache_entries_on_byte_size"
    t.index ["key_hash", "byte_size"], name: "index_solid_cache_entries_on_key_hash_and_byte_size"
    t.index ["key_hash"], name: "index_solid_cache_entries_on_key_hash", unique: true
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.string "concurrency_key", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "error"
    t.bigint "job_id", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "active_job_id"
    t.text "arguments"
    t.string "class_name", null: false
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "finished_at"
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at"
    t.datetime "updated_at", null: false
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "queue_name", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "hostname"
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.text "metadata"
    t.string "name", null: false
    t.integer "pid", null: false
    t.bigint "supervisor_id"
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.datetime "run_at", null: false
    t.string "task_key", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.text "arguments"
    t.string "class_name"
    t.string "command", limit: 2048
    t.datetime "created_at", null: false
    t.text "description"
    t.string "key", null: false
    t.integer "priority", default: 0
    t.string "queue_name"
    t.string "schedule", null: false
    t.boolean "static", default: true, null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.integer "value", default: 1, null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
  end

  create_table "subscriptions", force: :cascade do |t|
    t.boolean "cancel_at_period_end", default: false, null: false
    t.datetime "canceled_at"
    t.datetime "created_at", null: false
    t.datetime "current_period_end"
    t.datetime "current_period_start"
    t.bigint "organization_id", null: false
    t.integer "quantity", default: 1, null: false
    t.string "status", default: "active", null: false
    t.string "stripe_subscription_id", null: false
    t.string "stripe_subscription_item_id"
    t.datetime "updated_at", null: false
    t.index ["organization_id", "status"], name: "index_subscriptions_on_organization_id_and_status"
    t.index ["organization_id"], name: "index_subscriptions_on_organization_id"
    t.index ["stripe_subscription_id"], name: "index_subscriptions_on_stripe_subscription_id", unique: true
  end

  create_table "team_memberships", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "org_membership_id", null: false
    t.bigint "team_id", null: false
    t.datetime "updated_at", null: false
    t.index ["org_membership_id"], name: "index_team_memberships_on_org_membership_id"
    t.index ["team_id", "org_membership_id"], name: "index_team_memberships_on_team_id_and_org_membership_id", unique: true
    t.index ["team_id"], name: "index_team_memberships_on_team_id"
  end

  create_table "teams", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "created_by_id", null: false
    t.string "name", null: false
    t.bigint "organization_id", null: false
    t.bigint "parent_team_id"
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_teams_on_created_by_id"
    t.index ["organization_id", "slug"], name: "index_teams_on_organization_id_and_slug", unique: true
    t.index ["organization_id"], name: "index_teams_on_organization_id"
    t.index ["parent_team_id"], name: "index_teams_on_parent_team_id"
  end

  create_table "user_sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "ip_address"
    t.string "session_token", null: false
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.bigint "user_id", null: false
    t.index ["expires_at"], name: "index_user_sessions_on_expires_at"
    t.index ["session_token"], name: "index_user_sessions_on_session_token", unique: true
    t.index ["user_id"], name: "index_user_sessions_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.string "display_name"
    t.string "email"
    t.bigint "github_id", null: false
    t.string "github_username", null: false
    t.datetime "last_login_at", default: -> { "now()" }, null: false
    t.datetime "updated_at", null: false
    t.index ["github_id"], name: "index_users_on_github_id", unique: true
  end

  create_table "waitlist_entries", force: :cascade do |t|
    t.datetime "approved_at"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "github_username"
    t.string "status", default: "waiting", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_waitlist_entries_on_email"
    t.index ["github_username"], name: "index_waitlist_entries_on_github_username"
  end

  create_table "watched_repos", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "enabled", default: true
    t.datetime "last_polled_at"
    t.integer "poll_interval_seconds", default: 300
    t.bigint "repo_id", null: false
    t.datetime "updated_at", null: false
    t.index ["repo_id"], name: "index_watched_repos_on_repo_id", unique: true
  end

  add_foreign_key "api_keys", "users"
  add_foreign_key "commits", "prs"
  add_foreign_key "commits", "repos"
  add_foreign_key "github_installations", "organizations"
  add_foreign_key "github_installations", "users", column: "installed_by_id"
  add_foreign_key "invites", "organizations"
  add_foreign_key "invites", "users", column: "invited_by_id"
  add_foreign_key "org_memberships", "organizations"
  add_foreign_key "org_memberships", "users"
  add_foreign_key "org_memberships", "users", column: "invited_by_id"
  add_foreign_key "organizations", "users", column: "created_by_id"
  add_foreign_key "pr_files", "prs"
  add_foreign_key "pr_metrics", "prs"
  add_foreign_key "prs", "repos"
  add_foreign_key "repos", "github_installations"
  add_foreign_key "repos", "organizations"
  add_foreign_key "session_prs", "prs"
  add_foreign_key "sessions", "repos"
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "subscriptions", "organizations"
  add_foreign_key "team_memberships", "org_memberships"
  add_foreign_key "team_memberships", "teams"
  add_foreign_key "teams", "organizations"
  add_foreign_key "teams", "teams", column: "parent_team_id"
  add_foreign_key "teams", "users", column: "created_by_id"
  add_foreign_key "user_sessions", "users"
  add_foreign_key "watched_repos", "repos"
end
