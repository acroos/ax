class SessionPrCorrelationService
  def initialize(repo)
    @repo = repo
  end

  def call
    correlate_sessions_to_prs
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
        .max_by { |p| p.created_at_source&.to_f || 0 }
      next unless pr

      SessionPr.find_or_create_by!(session_id: session.id, pr_id: pr.id) do |sp|
        sp.confidence = "branch_match"
      end
    end
  end

  # Returns true if the session's time range overlaps the PR's active period.
  # All timestamp columns are now proper datetime — no manual parsing needed.
  def session_overlaps_pr?(session, pr)
    pr_start = pr.created_at_source
    pr_end = pr.merged_at || pr.closed_at
    session_start = session.started_at
    session_end = session.ended_at

    return false unless pr_start && session_start

    # If PR is still open, any session after PR creation matches
    if pr_end.nil?
      return session_end.nil? || session_end >= pr_start
    end

    # Standard interval overlap: session started before PR closed AND session ended after PR opened
    (session_start <= pr_end) && (session_end.nil? || session_end >= pr_start)
  end
end
