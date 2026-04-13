class MetricsComputer
  TEST_FILE_CONTAINS = %w[
    .test.
    .spec.
    _test.
    _test/
    __tests__/
    /test/
    /tests/
  ].freeze

  TEST_FILE_PREFIXES = %w[
    test/
    tests/
  ].freeze

  def initialize(pr)
    @pr = pr
  end

  def call
    {
      diff_churn_lines: compute_diff_churn,
      has_tests: compute_has_tests,
      line_revisit_rate: compute_line_revisit_rate
    }
  end

  private

  def compute_diff_churn
    total_added = @pr.commits.sum(:additions)
    net_added = @pr.additions || 0

    churn = total_added - net_added
    [ churn, 0 ].max
  end

  def compute_has_tests
    filenames = @pr.pr_files.pluck(:filename)
    has_test_files?(filenames)
  end

  def compute_line_revisit_rate
    filenames = @pr.pr_files.pluck(:filename)
    return nil if filenames.empty?

    # Find files in this PR that also appear in other finalized PRs in the same repo
    other_pr_ids = PrMetrics
      .joins(:pr)
      .where(prs: { repo_id: @pr.repo_id }, metrics_finalized: true)
      .where.not(pr_id: @pr.id)
      .pluck(:pr_id)

    return 0.0 if other_pr_ids.empty?

    revisited_count = PrFile
      .where(pr_id: other_pr_ids, filename: filenames)
      .distinct
      .count(:filename)

    revisited_count.to_f / filenames.size
  end

  def has_test_files?(files)
    files.any? do |f|
      lower = f.downcase
      TEST_FILE_CONTAINS.any? { |pattern| lower.include?(pattern) } ||
        TEST_FILE_PREFIXES.any? { |prefix| lower.start_with?(prefix) }
    end
  end
end
