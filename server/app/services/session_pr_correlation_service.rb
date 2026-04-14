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

    # Build lookup: branch → most recent PR (last one wins)
    pr_by_branch = {}
    prs.order(created_at: :asc).each { |pr| pr_by_branch[pr.branch] = pr }

    sessions.find_each do |session|
      pr = pr_by_branch[session.branch]
      next unless pr

      SessionPr.find_or_create_by!(session_id: session.id, pr_id: pr.id) do |sp|
        sp.confidence = "branch_match"
      end
    end
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
