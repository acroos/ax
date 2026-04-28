class PushService
  class Error < StandardError; end

  MAX_PRS_PER_PUSH = 500
  MAX_SESSIONS_PER_PUSH = 1_000
  MAX_COMMITS_PER_PUSH = 5_000
  MAX_SESSION_PRS_PER_PUSH = 1_000
  MAX_PR_METRICS_PER_PUSH = 500

  def initialize(params, user:)
    @params = params
    @user = user
  end

  def execute
    validate_entity_limits!
    counts = {
      repos: 0,
      prs: 0,
      commits: 0,
      sessions: 0,
      session_prs: 0,
      pr_metrics: 0
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

  def validate_entity_limits!
    check_limit(:prs, MAX_PRS_PER_PUSH)
    check_limit(:sessions, MAX_SESSIONS_PER_PUSH)
    check_limit(:commits, MAX_COMMITS_PER_PUSH)
    check_limit(:session_prs, MAX_SESSION_PRS_PER_PUSH)
    check_limit(:pr_metrics, MAX_PR_METRICS_PER_PUSH)
  end

  def check_limit(key, max)
    count = Array(@params[key]).size
    if count > max
      raise Error, "Too many #{key}: #{count} exceeds limit of #{max}"
    end
  end

  def upsert_repo!
    owner = @params[:owner]
    repo_name = @params[:repo]
    user_org_ids = @user.organization_ids

    # Canonical lookup: github identity within user's orgs
    repo = Repo.find_by(github_owner: owner, github_repo: repo_name, organization_id: user_org_ids) if owner.present? && repo_name.present?

    # Fallback: path-based lookup (legacy)
    repo ||= Repo.find_by(path: @params[:repo_path]) if @params[:repo_path].present?

    repo ||= Repo.new

    was_new_record = repo.new_record?

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

    # Verify plan limit after insert to prevent concurrent pushes from exceeding limits.
    # Locking the org serializes concurrent repo creations within the same transaction.
    if was_new_record
      target_org = repo.organization
      if target_org
        target_org.lock!
        plan = PlanService.for(target_org)
        # repos.count includes the just-inserted repo; subtract 1 to get the
        # pre-insert count that within_limit? expects (checks count < max).
        unless plan.within_limit?(:max_repos, target_org.repos.count - 1)
          raise Error, "Plan limit reached: your #{plan.plan_name} plan allows #{plan.capability(:max_repos)} repos. Upgrade at #{ENV.fetch('DASHBOARD_URL', 'http://localhost:3333')}/#{target_org.slug}/billing"
        end
      end
    end

    repo
  end

  PR_UPDATE_COLUMNS = %i[
    title branch state created_at_source merged_at closed_at
    url additions deletions changed_files
  ].freeze

  def upsert_prs(repo, pr_map)
    pr_data_list = Array(@params[:prs])
    return if pr_data_list.empty?

    now = Time.current
    rows = pr_data_list.map do |pr_data|
      {
        repo_id: repo.id,
        number: pr_data[:number],
        title: pr_data[:title],
        branch: pr_data[:branch],
        state: pr_data[:state],
        created_at_source: pr_data[:created_at],
        merged_at: pr_data[:merged_at],
        closed_at: pr_data[:closed_at],
        url: pr_data[:url],
        additions: pr_data[:additions] || 0,
        deletions: pr_data[:deletions] || 0,
        changed_files: pr_data[:changed_files] || 0,
        created_at: now,
        updated_at: now
      }
    end

    Pr.upsert_all(rows, unique_by: %i[repo_id number], update_only: PR_UPDATE_COLUMNS)

    numbers = pr_data_list.map { |d| d[:number].to_i }
    Pr.where(repo_id: repo.id, number: numbers).each do |pr|
      pr_map[pr.number] = pr
    end
  end

  SESSION_UPDATE_COLUMNS = %i[
    repo_id agent_type branch started_at ended_at message_count turn_count
    input_tokens output_tokens cache_creation_input_tokens cache_read_input_tokens
    primary_model files_read_count files_modified_count
    assistant_message_count sidechain_messages total_file_reads pushed_by
    peak_context_pct total_tool_calls agent_tool_calls skill_tool_calls mcp_tool_calls
    extras payload_version
  ].freeze

  def upsert_sessions(repo)
    session_data_list = Array(@params[:sessions])
    return 0 if session_data_list.empty?

    # Prevent cross-repo session ID collision: skip sessions owned by another repo
    session_ids = session_data_list.map { |s| s[:id] }
    colliding_ids = CodingSession.where(id: session_ids)
                                  .where.not(repo_id: repo.id)
                                  .pluck(:id)
                                  .to_set

    colliding_ids.each do |id|
      Rails.logger.warn("Session ID collision: #{id} already belongs to another repo, skipping for repo #{repo.id}")
    end

    valid_sessions = session_data_list.reject { |s| colliding_ids.include?(s[:id]) }
    return 0 if valid_sessions.empty?

    now = Time.current
    rows = valid_sessions.map do |s|
      {
        id: s[:id],
        repo_id: repo.id,
        agent_type: s[:agent_type].presence || "claude_code",
        branch: s[:branch],
        started_at: epoch_ms_to_time(s[:started_at]),
        ended_at: epoch_ms_to_time(s[:ended_at]),
        message_count: s[:message_count] || 0,
        turn_count: s[:turn_count] || 0,
        input_tokens: field_value(s, :input_tokens),
        output_tokens: field_value(s, :output_tokens),
        cache_creation_input_tokens: field_value(s, :cache_creation_input_tokens),
        cache_read_input_tokens: field_value(s, :cache_read_input_tokens),
        primary_model: s[:primary_model],
        files_read_count: s[:files_read_count] || 0,
        files_modified_count: s[:files_modified_count] || 0,
        assistant_message_count: s[:assistant_message_count] || 0,
        sidechain_messages: field_value(s, :sidechain_messages),
        total_file_reads: s[:total_file_reads] || 0,
        pushed_by: @user.github_username,
        peak_context_pct: field_value(s, :peak_context_pct),
        total_tool_calls: s[:total_tool_calls] || 0,
        agent_tool_calls: s[:agent_tool_calls] || 0,
        skill_tool_calls: s[:skill_tool_calls] || 0,
        mcp_tool_calls: s[:mcp_tool_calls] || 0,
        extras: s[:extras] || {},
        payload_version: @params[:payload_version]&.to_i || 1,
        created_at: now,
        updated_at: now
      }
    end

    CodingSession.upsert_all(rows, unique_by: :id, update_only: SESSION_UPDATE_COLUMNS)
    valid_sessions.size
  end

  # Returns the field value for session_data if the agent supports the field,
  # nil otherwise. Falls back to "claude_code" when agent_type is absent.
  def field_value(session_data, field)
    agent_type = session_data[:agent_type].presence || "claude_code"
    return nil unless AgentRegistry.supports_field?(agent_type, field)

    session_data[field]
  end

  COMMIT_UPDATE_COLUMNS = %i[
    repo_id pr_id session_id message author committed_at
    is_claude_authored is_post_open additions deletions files_changed
  ].freeze

  def upsert_commits(repo, pr_map)
    commit_data_list = Array(@params[:commits])
    return 0 if commit_data_list.empty?

    now = Time.current
    rows = commit_data_list.map do |c|
      pr = pr_map[c[:pr_number].to_i]
      {
        sha: c[:sha],
        repo_id: repo.id,
        pr_id: pr&.id,
        session_id: c[:session_id],
        message: c[:message],
        author: c[:author],
        committed_at: c[:committed_at],
        is_claude_authored: c[:is_claude_authored] || false,
        is_post_open: c[:is_post_open] || false,
        additions: c[:additions] || 0,
        deletions: c[:deletions] || 0,
        files_changed: c[:files_changed] || 0,
        created_at: now,
        updated_at: now
      }
    end

    Commit.upsert_all(rows, unique_by: :sha, update_only: COMMIT_UPDATE_COLUMNS)
    commit_data_list.size
  end

  def upsert_session_prs(pr_map)
    sp_data_list = Array(@params[:session_prs])
    return 0 if sp_data_list.empty?

    now = Time.current
    rows = sp_data_list.filter_map do |sp|
      pr = pr_map[sp[:pr_number].to_i]
      next unless pr

      {
        session_id: sp[:session_id],
        pr_id: pr.id,
        confidence: sp[:confidence],
        created_at: now,
        updated_at: now
      }
    end
    return 0 if rows.empty?

    SessionPr.upsert_all(rows, unique_by: %i[session_id pr_id], update_only: %i[confidence])
    rows.size
  end

  PR_METRICS_UPDATE_COLUMNS = %i[
    post_open_commits ci_success_rate line_revisit_rate
  ].freeze

  def upsert_pr_metrics(pr_map)
    metrics_data_list = Array(@params[:pr_metrics])
    return 0 if metrics_data_list.empty?

    valid_metrics = metrics_data_list.select { |m| pr_map[m[:pr_number].to_i] }
    return 0 if valid_metrics.empty?

    # Skip already-finalized PRs (replicates prevent_settled_github_update callback)
    pr_ids = valid_metrics.map { |m| pr_map[m[:pr_number].to_i].id }
    finalized_pr_ids = PrMetrics.where(pr_id: pr_ids, metrics_finalized: true)
                                .pluck(:pr_id)
                                .to_set

    now = Time.current
    rows = valid_metrics.filter_map do |m|
      pr = pr_map[m[:pr_number].to_i]
      next if finalized_pr_ids.include?(pr.id)

      {
        pr_id: pr.id,
        post_open_commits: m[:post_open_commits],
        ci_success_rate: m[:ci_success_rate],
        line_revisit_rate: m[:line_revisit_rate],
        created_at: now,
        updated_at: now
      }
    end

    PrMetrics.upsert_all(rows, unique_by: :pr_id, update_only: PR_METRICS_UPDATE_COLUMNS) if rows.any?
    valid_metrics.size
  end

  # Convert epoch milliseconds (from CLI) to Time. Returns nil for nil/zero.
  def epoch_ms_to_time(value)
    return nil if value.nil? || value == 0
    Time.at(value / 1000.0).utc
  end

  def trigger_post_push(repo)
    if repo.github_installation_id.present?
      BackfillRepoJob.perform_later(repo.id)
    else
      SessionPrCorrelationService.new(repo).call
    end
  end
end
