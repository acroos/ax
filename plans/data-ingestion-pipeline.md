# Plan: Fix Data Ingestion Pipeline — Immediate PR Visibility

## Context

The pull requests tab shows zero finalized PRs after `ax push --all` because:

1. **The CLI sends only session data** — the `prs`, `commits`, `session_prs`, and `pr_metrics` arrays are never populated in the Go push payload
2. **The dashboard hard-filters on `metrics_finalized = true`** — PRs without finalized metrics are invisible
3. **Finalization only happens via GitHub webhooks or backfill** — no fallback exists
4. **Backfill is a one-shot job** — runs once at GitHub App install, not on push or repo addition
5. **No session-to-PR correlation exists server-side** — the CLI doesn't send it, and the server doesn't compute it

The goal: within seconds of signing up, installing the GitHub App, adding repos, or running `ax push`, users see their PR data.

**Constraint**: GitHub App is required for PR data. No user OAuth token storage.

---

## Step 1: DB Migration — Fix Repo Identity

**Problem**: `repos.path` is the unique lookup key, but it's a local filesystem path (different per developer). Backfill uses `github_owner + github_repo`. This causes duplicates when backfill runs before push, or when multiple developers push the same repo.

**Files to modify:**
- `server/db/migrate/` — new migration

**Changes:**
- Add unique index on `(organization_id, github_owner, github_repo)`
- Remove unique constraint on `path` (keep it as a non-unique, nullable column)
- Backfill existing data: set `path` to `"#{github_owner}/#{github_repo}"` for any repos with local filesystem paths where another repo in the same org has the same `github_owner/github_repo`

**Model change** (`server/app/models/repo.rb`):
- Change validation: `validates :path, presence: true, uniqueness: true` → `validates :github_owner, uniqueness: { scope: [:organization_id, :github_repo] }, allow_nil: true`

---

## Step 2: PushService — Fix Repo Lookup + Trigger Backfill

**Problem**: PushService looks up repos by `path`, causing duplicates. It also doesn't trigger any backfill or correlation.

**File**: `server/app/services/push_service.rb`

**Changes to `upsert_repo!`:**
```ruby
def upsert_repo!
  owner = @params[:owner]
  repo_name = @params[:repo]
  user_org_ids = @user.organization_ids

  # Canonical lookup: github identity within user's orgs
  repo = Repo.find_by(github_owner: owner, github_repo: repo_name, organization_id: user_org_ids) if owner.present? && repo_name.present?

  # Fallback: path-based lookup (legacy)
  repo ||= Repo.find_by(path: @params[:repo_path]) if @params[:repo_path].present?

  repo ||= Repo.new

  if repo.organization_id.present?
    unless @user.member_of?(repo.organization)
      raise Error, "You are not a member of the organization that owns this repository"
    end
  else
    repo.organization = @user.personal_org
  end

  repo.update!(
    path: @params[:repo_path] || "#{owner}/#{repo_name}",
    remote_url: @params[:remote_url],
    github_owner: owner,
    github_repo: repo_name,
    last_synced_at: Time.current
  )
  repo
end
```

**Add post-transaction hook** (after `execute` returns):
```ruby
# After transaction commits, trigger async backfill if GitHub App is linked
if repo.github_installation_id.present?
  BackfillRepoJob.perform_later(repo.id)
else
  SessionPrCorrelationService.new(repo).call
end
```

---

## Step 3: New Job — `BackfillRepoJob`

**Purpose**: Single-repo backfill. Fetches PRs from GitHub API, creates/updates PR records, finalizes closed/merged PRs, then correlates sessions.

**File**: `server/app/jobs/backfill_repo_job.rb` (new)

**Logic** (extracted from `BackfillInstallationJob#backfill_repo` + `#backfill_pr`):
```
perform(repo_id):
  repo = Repo.find(repo_id)
  installation = repo.github_installation
  return unless installation&.active?

  client = GithubApp::Client.new(installation)
  since = ENV.fetch("GITHUB_APP_BACKFILL_DAYS", "90").to_i.days.ago

  pulls = client.list_pulls(owner:, repo:, state: "all", since:)
  repo_data = { owner: { login: repo.github_owner }, name: repo.github_repo }

  pulls.each do |pr_data|
    backfill_pr(pr_data, repo_data)  # Same logic as BackfillInstallationJob#backfill_pr
  end

  # NEW: correlate sessions to PRs after backfill
  SessionPrCorrelationService.new(repo).call

  repo.update!(last_synced_at: Time.current)
```

Add rate-limit retries (same as BackfillInstallationJob):
```ruby
retry_on Octokit::TooManyRequests, wait: :polynomially_longer, attempts: 8
retry_on Octokit::ServerError, wait: :polynomially_longer, attempts: 3
```

The `backfill_pr` and `backfill_reviews` methods are identical to the existing `BackfillInstallationJob` private methods — extract them into a shared concern or module (`Backfillable`).

---

## Step 4: New Service — `SessionPrCorrelationService`

**Purpose**: Match `CodingSession` records to `Pr` records within a repo by branch name. Compute session-derived PR metrics from linked sessions. Works on both settled and unsettled PRs — session data is always accepted.

**File**: `server/app/services/session_pr_correlation_service.rb` (new)

**Logic:**
```
initialize(repo)

call:
  sessions = CodingSession.where(repo_id: @repo.id).where.not(branch: [nil, ""])
  prs = Pr.where(repo_id: @repo.id).where.not(branch: [nil, ""])

  # Build lookup: branch → most recent PR (prefer open, then latest)
  pr_by_branch = {}
  prs.order(created_at: :asc).each { |pr| pr_by_branch[pr.branch] = pr }

  sessions.find_each do |session|
    pr = pr_by_branch[session.branch]
    next unless pr

    SessionPr.find_or_create_by!(session_id: session.id, pr_id: pr.id) do |sp|
      sp.confidence = "branch_match"
    end
  end

  # Recompute session-derived metrics for ALL affected PRs (including settled)
  recompute_session_metrics(prs)

private

recompute_session_metrics(prs):
  prs.includes(:pr_metrics, :session_prs).find_each do |pr|
    linked_sessions = pr.coding_sessions  # through session_prs
    next if linked_sessions.empty?

    metrics = PrMetrics.find_or_create_by!(pr: pr)
    # Uses update_session_metrics! which bypasses the GitHub-field write lock
    metrics.update_session_metrics!(
      messages_per_pr: linked_sessions.sum(:message_count),
      token_cost_usd: linked_sessions.sum(:total_cost_usd),
      iteration_depth: linked_sessions.maximum(:turn_count)
    )
  end
```

**Key behaviors:**
- Idempotent: `find_or_create_by!` prevents duplicate SessionPr records
- Works on settled PRs: session-derived metrics are always updatable (see Step 10)
- Only matches on branch within the same repo
- Aggregates: messages summed, cost summed, depth = max turn count

---

## Step 5: Refactor `BackfillInstallationJob`

**File**: `server/app/jobs/github_app/backfill_installation_job.rb`

**Change**: Instead of inline backfilling each repo, delegate to `BackfillRepoJob`:
```ruby
def perform(installation_id)
  installation = GithubInstallation.find(installation_id)
  return unless installation.active?

  client = GithubApp::Client.new(installation)

  client.list_repositories.each do |gh_repo|
    repo = upsert_repo(installation, gh_repo)
    BackfillRepoJob.perform_later(repo.id)
  end

  installation.update!(last_synced_at: Time.current)
end
```

Remove `backfill_repo`, `backfill_pr`, `backfill_reviews` private methods (moved to `BackfillRepoJob` or shared concern).

---

## Step 6: `InstallationRepositories` Webhook — Trigger Backfill for Added Repos

**File**: `server/app/services/webhook_handlers/installation_repositories.rb`

**Change**: After creating/updating each added repo, enqueue `BackfillRepoJob`:
```ruby
def handle_added(installation)
  repos_added = @payload[:repositories_added] || []

  repos_added.each do |repo_data|
    full_name = repo_data[:full_name]
    owner, name = full_name.split("/", 2)

    repo = Repo.find_or_initialize_by(github_owner: owner, github_repo: name)
    repo.organization = installation.organization
    repo.github_installation = installation
    repo.path ||= full_name
    repo.save!

    BackfillRepoJob.perform_later(repo.id)  # NEW
  end
end
```

---

## Step 7: `PrOpened` Webhook — Trigger Correlation

**File**: `server/app/services/webhook_handlers/pr_opened.rb`

**Change**: After creating the PR, correlate with existing sessions:
```ruby
def call
  repo = find_repo(@repo_data)
  return unless repo

  pr = find_or_create_pr(repo, @pr_data)
  pr.update!(state: "open", open_commit_count: @pr_data[:commits])

  metrics = ensure_pr_metrics(pr)
  metrics.update!(post_open_commits: 0) unless metrics.finalized?

  # NEW: correlate this PR's branch with existing sessions
  SessionPrCorrelationService.new(repo).call
end
```

---

## Step 8: Dashboard API — Show All PRs (Relax Finalization Filter)

### API changes

**File**: `server/app/controllers/api/v1/organizations_controller.rb`

Change `prs` action to return all PRs with metrics (not just finalized):
```ruby
def prs
  prs = Pr
    .joins(:repo)
    .where(repos: { organization_id: @org.id })
    .left_joins(:pr_metrics)        # LEFT join — include PRs without metrics
    .includes(:pr_metrics, :repo)
    .order(created_at: :desc)

  render json: prs.map { |pr| pr_with_metrics(pr) }
end
```

**File**: `server/app/controllers/api/v1/repos_controller.rb`

Same change for `prs` action:
```ruby
def prs
  prs = @repo.prs
    .left_joins(:pr_metrics)
    .includes(:pr_metrics)

  render json: prs.map { |pr| pr_with_metrics(pr) }
end
```

**Keep `metrics_finalized = true` filter for aggregate endpoints** (`metrics`, `timeline`) — these should only use complete data.

### Dashboard UI changes

**File**: `dashboard/src/lib/db.ts`

Add `metrics_finalized` to `PRMetrics` interface (already exists). No changes needed.

**File**: `dashboard/src/app/[slug]/prs/page.tsx`

- Change subtitle from `"{n} finalized pull request(s)"` to `"{n} pull request(s)"`
- Add a finalization status indicator to each row — a small dot or icon in the state column area:
  - Finalized: no extra indicator (full metrics shown)
  - Not finalized: subtle "pending" indicator, null metrics show as `—` (already handled)

---

## Step 9: Pr Model — Add `coding_sessions` Association

**File**: `server/app/models/pr.rb`

Add the through association so correlation service can easily query:
```ruby
has_many :session_prs, dependent: :destroy
has_many :coding_sessions, through: :session_prs, source: :session
```

Also check `SessionPr` model has the right associations:
```ruby
belongs_to :pr
belongs_to :session, class_name: "CodingSession", foreign_key: "session_id"
```

---

## Step 10: Replace Write Lock with Scoped Protection

**Problem**: The current `prevent_finalized_update` callback on `PrMetrics` locks ALL fields once `metrics_finalized` is true. This means late-arriving session data (the normal case — developers push after PRs merge) is silently dropped. The correlation service can never enrich a settled PR.

**Concept change**: "Finalized" becomes "settled." GitHub-derived metrics lock when the PR reaches terminal state (they genuinely won't change). Session-derived metrics remain updatable because session data is inherently late-arriving.

**File**: `server/app/models/pr_metrics.rb`

**Changes:**

Replace the blanket write lock with scoped protection:
```ruby
GITHUB_DERIVED_FIELDS = %w[
  post_open_commits first_pass_accepted ci_success_rate
  diff_churn_lines has_tests line_revisit_rate
].freeze

SESSION_DERIVED_FIELDS = %w[
  messages_per_pr iteration_depth token_cost_usd
  self_correction_rate context_efficiency error_recovery_attempts
  plan_coverage_score plan_deviation_score scope_creep_detected
].freeze

before_update :prevent_settled_github_update

# Public method for session enrichment — bypasses GitHub field lock
def update_session_metrics!(attrs)
  # Filter to only session-derived fields
  safe_attrs = attrs.slice(*SESSION_DERIVED_FIELDS.map(&:to_sym))
  update!(safe_attrs)
end

private

def prevent_settled_github_update
  return unless metrics_finalized_was && metrics_finalized

  github_changes = changed & GITHUB_DERIVED_FIELDS
  if github_changes.any?
    errors.add(:base, "Settled GitHub metrics cannot be updated: #{github_changes.join(', ')}")
    throw(:abort)
  end
end
```

**Effect**: `SessionPrCorrelationService` can enrich settled PRs with session data. `PrMerged`/`PrClosed` handlers still lock GitHub metrics on close. The `update_session_metrics!` method provides a clean API that makes the intent explicit.

**Rename throughout**: Consider renaming `metrics_finalized` to `metrics_settled` in the DB and code to reflect the new semantics. This is optional but improves clarity. If renamed, add the migration in Step 1.

---

## Step 11: Periodic Reconciliation — `ReconcileReposJob`

**Problem**: If a webhook is missed (network blip, server downtime, GitHub delivery failure), the affected PR is never updated. There's no self-healing mechanism. A PR could be merged on GitHub but show as "open" in AX forever.

**Purpose**: Scheduled job that re-syncs repos from the GitHub API, catching any drift between AX's state and GitHub's truth.

**File**: `server/app/jobs/reconcile_repos_job.rb` (new)

**Logic:**
```ruby
class ReconcileReposJob < ApplicationJob
  queue_as :default

  # Run daily via Solid Queue recurring schedule
  # config/recurring.yml:
  #   reconcile_repos:
  #     class: ReconcileReposJob
  #     schedule: every day at 3am

  def perform
    # Find all repos with an active GitHub App installation
    Repo.joins(:github_installation)
        .where(github_installations: { status: "active" })
        .find_each do |repo|
      BackfillRepoJob.perform_later(repo.id)
    end
  end
end
```

**Why this works**: `BackfillRepoJob` is already idempotent — it fetches PRs from the API, upserts records, and skips already-settled PRs for GitHub metrics. Running it daily catches:
- Missed webhooks (PR merged but AX didn't know)
- State drift (PR reopened, labels changed, etc.)
- New PRs created during any downtime

**Scheduling**: Use Solid Queue's recurring schedule (`config/recurring.yml`) or a simple cron. Daily at a low-traffic time is sufficient — webhooks handle the real-time path, this is the safety net.

**Rate limiting**: The job enqueues one `BackfillRepoJob` per repo, each of which respects GitHub rate limits via the existing retry mechanism. For orgs with many repos, the jobs process serially through the queue.

---

## File Summary

| File | Action | Size |
|------|--------|------|
| `server/db/migrate/XXXXXX_fix_repo_identity.rb` | New migration | S |
| `server/app/models/repo.rb` | Update validation | S |
| `server/app/models/pr.rb` | Add through association | S |
| `server/app/models/session_pr.rb` | Verify associations | S |
| `server/app/models/pr_metrics.rb` | Replace blanket write lock with scoped protection | M |
| `server/app/services/push_service.rb` | Fix repo lookup, add backfill trigger | M |
| `server/app/jobs/backfill_repo_job.rb` | New job (extracted logic) | M |
| `server/app/services/session_pr_correlation_service.rb` | New service | M |
| `server/app/jobs/reconcile_repos_job.rb` | New scheduled job (periodic reconciliation) | S |
| `server/app/jobs/github_app/backfill_installation_job.rb` | Refactor to delegate | S |
| `server/app/services/webhook_handlers/installation_repositories.rb` | Add backfill trigger | S |
| `server/app/services/webhook_handlers/pr_opened.rb` | Add correlation trigger | S |
| `server/app/controllers/api/v1/organizations_controller.rb` | Relax PR filter | S |
| `server/app/controllers/api/v1/repos_controller.rb` | Relax PR filter | S |
| `dashboard/src/app/[slug]/prs/page.tsx` | Update subtitle + add status indicator | S |
| `config/recurring.yml` (or equivalent) | Add daily schedule for ReconcileReposJob | S |
| Wiki updates | Update data-flow.md, rails-server.md | S |

---

## Verification

1. **Unit tests**: Add specs for `SessionPrCorrelationService`, `BackfillRepoJob`, and `ReconcileReposJob`
2. **Scoped write lock test**: Verify that session-derived metrics can be updated on settled PRs, but GitHub-derived metrics cannot
3. **Late session enrichment test**: Settle a PR (merge), then push session data — verify session metrics are populated (not dropped)
4. **Integration test**: Create a repo via push, install GitHub App, verify PRs appear with correlated session data
5. **Manual test flow**:
   - Sign up, install GitHub App for a repo with existing PRs
   - Verify PRs appear in dashboard within seconds
   - Run `ax push --all` — verify sessions are correlated to PRs
   - Add a new repo to the GitHub App — verify it gets backfilled
   - Check that aggregate metrics still use only settled PRs
6. **Dedup test**: Push from two different local paths for the same GitHub repo — verify only one repo record exists
7. **Idempotency test**: Run `BackfillRepoJob` twice for the same repo — verify no duplicates or errors
8. **Reconciliation test**: Simulate a missed webhook (merge a PR without webhook delivery), run `ReconcileReposJob`, verify the PR gets settled
