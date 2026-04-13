class PushService
  class Error < StandardError; end

  def initialize(params, user:)
    @params = params
    @user = user
  end

  def execute
    counts = {
      repos: 0,
      prs: 0,
      commits: 0,
      sessions: 0,
      session_prs: 0,
      pr_metrics: 0,
      repo_metrics: 0
    }

    repo = nil

    ActiveRecord::Base.transaction do
      repo = upsert_repo!
      counts[:repos] = 1

      pr_map = {}
      upsert_prs(repo, pr_map)
      counts[:prs] = pr_map.size

      counts[:sessions] = upsert_sessions(repo)
      counts[:commits] = upsert_commits(repo, pr_map)
      counts[:session_prs] = upsert_session_prs(pr_map)
      counts[:pr_metrics] = upsert_pr_metrics(pr_map)
      counts[:repo_metrics] = upsert_repo_metrics(repo)
    end

    # After transaction commits, trigger async backfill or correlation
    trigger_post_push(repo) if repo

    counts
  end

  private

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

  def upsert_prs(repo, pr_map)
    Array(@params[:prs]).each do |pr_data|
      pr = Pr.find_or_initialize_by(repo: repo, number: pr_data[:number])
      pr.update!(
        title: pr_data[:title],
        branch: pr_data[:branch],
        state: pr_data[:state],
        created_at_source: pr_data[:created_at],
        merged_at: pr_data[:merged_at],
        closed_at: pr_data[:closed_at],
        url: pr_data[:url],
        additions: pr_data[:additions] || 0,
        deletions: pr_data[:deletions] || 0,
        changed_files: pr_data[:changed_files] || 0
      )
      pr_map[pr_data[:number].to_i] = pr
    end
  end

  def upsert_sessions(repo)
    count = 0
    Array(@params[:sessions]).each do |session_data|
      session = CodingSession.find_or_initialize_by(id: session_data[:id])
      session.update!(
        repo: repo,
        branch: session_data[:branch],
        started_at: session_data[:started_at],
        ended_at: session_data[:ended_at],
        message_count: session_data[:message_count] || 0,
        turn_count: session_data[:turn_count] || 0,
        input_tokens: session_data[:input_tokens] || 0,
        output_tokens: session_data[:output_tokens] || 0,
        cache_creation_input_tokens: session_data[:cache_creation_input_tokens] || 0,
        cache_read_input_tokens: session_data[:cache_read_input_tokens] || 0,
        total_cost_usd: session_data[:total_cost_usd],
        primary_model: session_data[:primary_model]
      )
      count += 1
    end
    count
  end

  def upsert_commits(repo, pr_map)
    count = 0
    Array(@params[:commits]).each do |commit_data|
      pr = pr_map[commit_data[:pr_number].to_i]
      commit = Commit.find_or_initialize_by(sha: commit_data[:sha])
      commit.update!(
        repo: repo,
        pr: pr,
        session_id: commit_data[:session_id],
        message: commit_data[:message],
        author: commit_data[:author],
        committed_at: commit_data[:committed_at],
        is_claude_authored: commit_data[:is_claude_authored] || false,
        is_post_open: commit_data[:is_post_open] || false,
        additions: commit_data[:additions] || 0,
        deletions: commit_data[:deletions] || 0,
        files_changed: commit_data[:files_changed] || 0
      )
      count += 1
    end
    count
  end

  def upsert_session_prs(pr_map)
    count = 0
    Array(@params[:session_prs]).each do |sp_data|
      pr = pr_map[sp_data[:pr_number].to_i]
      next unless pr

      session_pr = SessionPr.find_or_initialize_by(session_id: sp_data[:session_id], pr: pr)
      session_pr.update!(confidence: sp_data[:confidence])
      count += 1
    end
    count
  end

  def upsert_pr_metrics(pr_map)
    count = 0
    Array(@params[:pr_metrics]).each do |metrics_data|
      pr = pr_map[metrics_data[:pr_number].to_i]
      next unless pr

      metrics = PrMetrics.find_or_initialize_by(pr: pr)

      # Skip if already finalized
      if metrics.persisted? && metrics.finalized?
        count += 1
        next
      end

      metrics.update!(
        messages_per_pr: metrics_data[:messages_per_pr],
        iteration_depth: metrics_data[:iteration_depth],
        post_open_commits: metrics_data[:post_open_commits],
        first_pass_accepted: to_bool(metrics_data[:first_pass_accepted]),
        ci_success_rate: metrics_data[:ci_success_rate],
        diff_churn_lines: metrics_data[:diff_churn_lines],
        has_tests: to_bool(metrics_data[:has_tests]),
        line_revisit_rate: metrics_data[:line_revisit_rate],
        self_correction_rate: metrics_data[:self_correction_rate],
        context_efficiency: metrics_data[:context_efficiency],
        error_recovery_attempts: metrics_data[:error_recovery_attempts],
        token_cost_usd: metrics_data[:token_cost_usd],
        plan_coverage_score: metrics_data[:plan_coverage_score],
        plan_deviation_score: metrics_data[:plan_deviation_score],
        scope_creep_detected: to_bool(metrics_data[:scope_creep_detected]),
        metrics_finalized: to_bool(metrics_data[:metrics_finalized]),
        finalized_at: metrics_data[:finalized_at]
      )
      count += 1
    end
    count
  end

  def upsert_repo_metrics(repo)
    rm = @params[:repo_metrics]
    return 0 unless rm.present?

    metrics = ::RepoMetrics.find_or_initialize_by(
      repo: repo,
      period_start: rm[:period_start],
      period_type: rm[:period_type]
    )
    metrics.update!(
      period_end: rm[:period_end],
      total_sessions: rm[:total_sessions] || 0,
      total_tokens: rm[:total_tokens] || 0,
      total_cost_usd: rm[:total_cost_usd] || 0,
      unmerged_tokens: rm[:unmerged_tokens] || 0,
      unmerged_cost_usd: rm[:unmerged_cost_usd] || 0,
      unmerged_rate: rm[:unmerged_rate]
    )
    1
  end

  def trigger_post_push(repo)
    if repo.github_installation_id.present?
      BackfillRepoJob.perform_later(repo.id)
    else
      SessionPrCorrelationService.new(repo).call
    end
  end

  def to_bool(value)
    return nil if value.nil?
    value == 1 || value == true || value == "1" || value == "true"
  end
end
