class MetricsComputer
  def initialize(pr)
    @pr = pr
  end

  def call
    {
      line_revisit_rate: compute_line_revisit_rate,
      ci_success_rate: compute_ci_success_rate,
      cache_hit_rate: compute_cache_hit_rate,
      sidechain_rate: compute_sidechain_rate,
      re_read_rate: compute_re_read_rate,
      autonomy_score: compute_autonomy_score
    }
  end

  private

  # Fraction of commits on this PR that passed all CI check suites.
  def compute_ci_success_rate
    commits_with_ci = @pr.commits.where.not(ci_passed: nil)
    return nil unless commits_with_ci.exists?

    commits_with_ci.where(ci_passed: true).count.to_f / commits_with_ci.count
  end

  REVISIT_LOOKBACK_DAYS = 7

  def compute_line_revisit_rate
    filenames = @pr.pr_files.pluck(:filename)
    return nil if filenames.empty?

    lookback = REVISIT_LOOKBACK_DAYS.days.ago

    # Find files in this PR that also appear in other finalized PRs
    # merged or closed within the lookback window
    other_pr_ids = PrMetrics
      .joins(:pr)
      .where(prs: { repo_id: @pr.repo_id }, metrics_finalized: true)
      .where.not(pr_id: @pr.id)
      .where("prs.merged_at >= :lookback OR prs.closed_at >= :lookback", lookback: lookback)
      .pluck(:pr_id)

    return 0.0 if other_pr_ids.empty?

    revisited_count = PrFile
      .where(pr_id: other_pr_ids, filename: filenames)
      .distinct
      .count(:filename)

    revisited_count.to_f / filenames.size
  end

  def correlated_sessions
    @correlated_sessions ||= CodingSession.joins(:session_prs).where(session_prs: { pr_id: @pr.id })
  end

  # Ratio of cache-read tokens to total input tokens across correlated sessions.
  # Higher means better prompt cache utilization and lower effective cost.
  def compute_cache_hit_rate
    sessions = correlated_sessions
    return nil if sessions.empty?

    total_input = sessions.sum(:input_tokens) +
                  sessions.sum(:cache_creation_input_tokens) +
                  sessions.sum(:cache_read_input_tokens)
    return nil if total_input == 0

    sessions.sum(:cache_read_input_tokens).to_f / total_input
  end

  # Ratio of sidechain messages to total messages across correlated sessions.
  # Higher means the model backtracked more often, indicating wasted work.
  def compute_sidechain_rate
    sessions = correlated_sessions
    return nil if sessions.empty?

    total_messages = sessions.sum(:message_count) + sessions.sum(:assistant_message_count)
    return nil if total_messages == 0

    sessions.sum(:sidechain_messages).to_f / total_messages
  end

  # Ratio of total file reads to unique files read across correlated sessions.
  # 1.0 means no re-reads; higher means files are being read redundantly.
  def compute_re_read_rate
    sessions = correlated_sessions
    return nil if sessions.empty?

    unique_reads = sessions.sum(:files_read_count)
    return nil if unique_reads == 0

    sessions.sum(:total_file_reads).to_f / unique_reads
  end

  # Ratio of assistant messages to human messages across correlated sessions.
  # Higher means the agent worked more independently with fewer human interventions.
  def compute_autonomy_score
    sessions = correlated_sessions
    return nil if sessions.empty?

    human = sessions.sum(:message_count)
    return nil if human == 0

    sessions.sum(:assistant_message_count).to_f / human
  end
end
