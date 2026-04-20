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

    if repo.new_record?
      target_org = repo.organization || @user.personal_org
      if target_org
        plan = PlanService.for(target_org)
        unless plan.within_limit?(:max_repos, target_org.repos.count)
          raise Error, "Plan limit reached: your #{plan.plan_name} plan allows #{plan.capability(:max_repos)} repos. Upgrade at #{ENV.fetch('DASHBOARD_URL', 'http://localhost:3333')}/#{target_org.slug}/billing"
        end
      end
    end

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
        primary_model: session_data[:primary_model],
        files_read_count: session_data[:files_read_count] || 0,
        files_modified_count: session_data[:files_modified_count] || 0,
        assistant_message_count: session_data[:assistant_message_count] || 0,
        sidechain_messages: session_data[:sidechain_messages] || 0,
        total_file_reads: session_data[:total_file_reads] || 0
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
        iteration_depth: metrics_data[:iteration_depth],
        post_open_commits: metrics_data[:post_open_commits],
        ci_success_rate: metrics_data[:ci_success_rate],
        line_revisit_rate: metrics_data[:line_revisit_rate],
        token_cost_usd: metrics_data[:token_cost_usd],
        metrics_finalized: to_bool(metrics_data[:metrics_finalized]),
        finalized_at: metrics_data[:finalized_at]
      )
      count += 1
    end
    count
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
