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

ActiveRecord::Schema[8.1].define(version: 2026_04_08_000016) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "api_keys", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key_hash", null: false
    t.datetime "last_used_at"
    t.string "name"
    t.boolean "revoked", default: false, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id"], name: "index_api_keys_on_user_id"
  end

  create_table "commits", primary_key: "sha", id: :string, force: :cascade do |t|
    t.integer "additions", default: 0
    t.string "author"
    t.string "committed_at"
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
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_organizations_on_created_by_id"
    t.index ["slug"], name: "index_organizations_on_slug", unique: true
  end

  create_table "plan_analyses", force: :cascade do |t|
    t.text "actual_files"
    t.text "analysis_json"
    t.float "coverage_score"
    t.datetime "created_at", null: false
    t.float "deviation_score"
    t.string "plan_file"
    t.text "planned_files"
    t.bigint "pr_id"
    t.boolean "scope_creep_detected", default: false
    t.datetime "updated_at", null: false
    t.index ["pr_id"], name: "index_plan_analyses_on_pr_id"
  end

  create_table "pr_metrics", force: :cascade do |t|
    t.float "ci_success_rate"
    t.datetime "computed_at", default: -> { "now()" }, null: false
    t.float "context_efficiency"
    t.datetime "created_at", null: false
    t.integer "diff_churn_lines"
    t.integer "error_recovery_attempts"
    t.datetime "finalized_at"
    t.boolean "first_pass_accepted"
    t.boolean "has_tests"
    t.integer "iteration_depth"
    t.float "line_revisit_rate"
    t.integer "messages_per_pr"
    t.boolean "metrics_finalized", default: false
    t.float "plan_coverage_score"
    t.float "plan_deviation_score"
    t.integer "post_open_commits"
    t.bigint "pr_id", null: false
    t.boolean "scope_creep_detected"
    t.float "self_correction_rate"
    t.float "token_cost_usd"
    t.datetime "updated_at", null: false
    t.index ["pr_id"], name: "index_pr_metrics_on_pr_id", unique: true
  end

  create_table "prs", force: :cascade do |t|
    t.integer "additions", default: 0
    t.string "author"
    t.string "branch"
    t.integer "changed_files", default: 0
    t.string "closed_at"
    t.datetime "created_at", null: false
    t.string "created_at_source"
    t.integer "deletions", default: 0
    t.string "merged_at"
    t.integer "number", null: false
    t.integer "open_commit_count"
    t.string "previous_state"
    t.string "pushed_by"
    t.bigint "repo_id", null: false
    t.string "state"
    t.string "title"
    t.datetime "updated_at", null: false
    t.string "url"
    t.index ["repo_id", "number"], name: "index_prs_on_repo_id_and_number", unique: true
    t.index ["repo_id"], name: "index_prs_on_repo_id"
  end

  create_table "repo_metrics", force: :cascade do |t|
    t.datetime "computed_at", default: -> { "now()" }, null: false
    t.datetime "created_at", null: false
    t.string "period_end", null: false
    t.string "period_start", null: false
    t.string "period_type", null: false
    t.bigint "repo_id", null: false
    t.float "total_cost_usd", default: 0.0
    t.integer "total_sessions", default: 0
    t.integer "total_tokens", default: 0
    t.float "unmerged_cost_usd", default: 0.0
    t.float "unmerged_rate"
    t.integer "unmerged_tokens", default: 0
    t.datetime "updated_at", null: false
    t.index ["repo_id", "period_start", "period_type"], name: "index_repo_metrics_on_repo_id_and_period_start_and_period_type", unique: true
    t.index ["repo_id"], name: "index_repo_metrics_on_repo_id"
  end

  create_table "repos", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "github_owner"
    t.string "github_repo"
    t.datetime "last_synced_at"
    t.bigint "organization_id"
    t.string "path", null: false
    t.string "remote_url"
    t.datetime "updated_at", null: false
    t.index ["organization_id"], name: "index_repos_on_organization_id"
    t.index ["path"], name: "index_repos_on_path", unique: true
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
    t.string "branch"
    t.integer "cache_creation_input_tokens", default: 0
    t.integer "cache_read_input_tokens", default: 0
    t.datetime "created_at", null: false
    t.string "cwd"
    t.bigint "ended_at"
    t.integer "input_tokens", default: 0
    t.integer "message_count", default: 0
    t.integer "output_tokens", default: 0
    t.string "primary_model"
    t.string "pushed_by"
    t.bigint "repo_id"
    t.bigint "started_at"
    t.float "total_cost_usd"
    t.integer "turn_count", default: 0
    t.datetime "updated_at", null: false
    t.index ["repo_id"], name: "index_sessions_on_repo_id"
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
  add_foreign_key "invites", "organizations"
  add_foreign_key "invites", "users", column: "invited_by_id"
  add_foreign_key "org_memberships", "organizations"
  add_foreign_key "org_memberships", "users"
  add_foreign_key "org_memberships", "users", column: "invited_by_id"
  add_foreign_key "organizations", "users", column: "created_by_id"
  add_foreign_key "plan_analyses", "prs"
  add_foreign_key "pr_metrics", "prs"
  add_foreign_key "prs", "repos"
  add_foreign_key "repo_metrics", "repos"
  add_foreign_key "repos", "organizations"
  add_foreign_key "session_prs", "prs"
  add_foreign_key "sessions", "repos"
  add_foreign_key "user_sessions", "users"
  add_foreign_key "watched_repos", "repos"
end
