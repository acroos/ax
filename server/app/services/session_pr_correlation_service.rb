class SessionPrCorrelationService
  def initialize(repo)
    @repo = repo
  end

  def call
    correlate_sessions_to_prs
    recompute_session_metrics
  end

  private

  def correlate_sessions_to_prs
    sessions = CodingSession.where(repo_id: @repo.id).where.not(branch: [ nil, "" ])
    prs = Pr.where(repo_id: @repo.id).where.not(branch: [ nil, "" ])

    # Group PRs by branch for efficient lookup
    prs_by_branch = prs.group_by(&:branch)

    sessions.find_each do |session|
      candidates = prs_by_branch[session.branch]
      next unless candidates

      # Find PRs whose lifecycle overlaps this session's time range
      pr = candidates
        .select { |p| session_overlaps_pr?(session, p) }
        .max_by { |p| parse_timestamp(p.created_at_source)&.to_f || 0 }
      next unless pr

      SessionPr.find_or_create_by!(session_id: session.id, pr_id: pr.id) do |sp|
        sp.confidence = "branch_match"
      end
    end
  end

  # Returns true if the session's time range overlaps the PR's active period.
  # Session timestamps are millisecond Unix epochs (bigint).
  # PR timestamps are ISO8601 strings.
  def session_overlaps_pr?(session, pr)
    pr_start = parse_timestamp(pr.created_at_source)
    pr_end = parse_timestamp(pr.merged_at) || parse_timestamp(pr.closed_at)
    session_start = epoch_ms_to_time(session.started_at)
    session_end = epoch_ms_to_time(session.ended_at)

    return false unless pr_start && session_start

    # If PR is still open, any session after PR creation matches
    if pr_end.nil?
      return session_end.nil? || session_end >= pr_start
    end

    # Standard interval overlap: session started before PR closed AND session ended after PR opened
    (session_start <= pr_end) && (session_end.nil? || session_end >= pr_start)
  end

  def parse_timestamp(value)
    return nil if value.blank?
    Time.parse(value)
  rescue ArgumentError
    nil
  end

  def epoch_ms_to_time(value)
    return nil if value.nil?
    Time.at(value / 1000.0)
  end

  def recompute_session_metrics
    prs = Pr.where(repo_id: @repo.id)
            .joins(:session_prs)
            .distinct

    prs.find_each do |pr|
      linked_sessions = pr.coding_sessions
      next if linked_sessions.empty?

      metrics = PrMetrics.find_or_create_by!(pr: pr)
      computed = MetricsComputer.new(pr).call

      session_attrs = {
        messages_per_pr: linked_sessions.sum(:message_count),
        token_cost_usd: linked_sessions.sum(:total_cost_usd),
        iteration_depth: linked_sessions.maximum(:turn_count),
        cache_hit_rate: computed[:cache_hit_rate],
        sidechain_rate: computed[:sidechain_rate],
        re_read_rate: computed[:re_read_rate],
        autonomy_score: computed[:autonomy_score]
      }

      # Compute plan metrics if any session has planned files
      plan_result = MetricsComputer.new(pr).compute_plan_metrics
      session_attrs.merge!(plan_result) if plan_result

      # Use update_session_metrics! which bypasses the GitHub-field lock,
      # allowing session enrichment even on settled PRs.
      metrics.update_session_metrics!(session_attrs)
    end
  end
end
