class MetricsComputer
  def initialize(pr)
    @pr = pr
  end

  def call
    {
      line_revisit_rate: compute_line_revisit_rate,
      ci_success_rate: compute_ci_success_rate
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
end
