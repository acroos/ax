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

  # Files that don't require test coverage — docs, CI, config, lock files, build artifacts
  NON_TESTABLE_EXTENSIONS = %w[
    .md .txt .rst .adoc
    .yml .yaml .toml
    .lock
    .gitignore .editorconfig .dockerignore
  ].freeze

  NON_TESTABLE_FILENAMES = %w[
    license changelog makefile dockerfile
    package-lock.json go.sum yarn.lock pnpm-lock.yaml cargo.lock gemfile.lock
  ].freeze

  NON_TESTABLE_PREFIXES = %w[
    .github/
    .circleci/
    .gitlab-ci
  ].freeze

  def initialize(pr)
    @pr = pr
  end

  # Lock files and generated files excluded from plan comparison
  IGNORED_PLAN_FILES = %w[
    package-lock.json package.json go.sum go.mod
    yarn.lock pnpm-lock.yaml cargo.lock gemfile.lock
  ].freeze

  def call
    result = {
      diff_churn_lines: compute_diff_churn,
      has_tests: compute_has_tests,
      line_revisit_rate: compute_line_revisit_rate,
      self_correction_rate: compute_self_correction_rate,
      context_efficiency: compute_context_efficiency,
      error_recovery_attempts: compute_error_recovery_attempts
    }

    plan_result = compute_plan_metrics
    result.merge!(plan_result) if plan_result

    result
  end

  # Computes plan coverage, deviation, and scope creep from correlated session plan data.
  # Public because SessionPrCorrelationService calls it directly.
  # Returns nil if no sessions have planned files.
  def compute_plan_metrics
    sessions = correlated_sessions
    return nil if sessions.empty?

    # Collect planned files from all correlated sessions
    planned_files = sessions.filter_map { |s| s.planned_files }.flat_map { |json|
      JSON.parse(json) rescue []
    }.uniq

    return nil if planned_files.empty?

    # Actual files from the PR (via GitHub API)
    actual_files = @pr.pr_files.pluck(:filename)
    return nil if actual_files.empty?

    # Filter out ignored files from actuals
    filtered_actual = actual_files.reject { |f| IGNORED_PLAN_FILES.include?(File.basename(f).downcase) }
    return nil if filtered_actual.empty?

    # Match planned files against actual files using fuzzy matching
    matched_planned = Set.new
    matched_actual = Set.new

    filtered_actual.each do |actual|
      planned_files.each do |planned|
        if paths_match?(actual, planned)
          matched_planned << planned
          matched_actual << actual
          break
        end
      end
    end

    covered_count = matched_actual.size
    unplanned_count = filtered_actual.size - covered_count

    # Coverage: what fraction of actual changes were planned?
    coverage = covered_count.to_f / filtered_actual.size

    # Deviation: what fraction of planned files were actually changed?
    deviation = covered_count.to_f / planned_files.size

    # Scope creep: more than half the changes were unplanned
    scope_creep = unplanned_count.to_f / filtered_actual.size > 0.5

    # Store plan analysis record
    PlanAnalysis.find_or_initialize_by(pr: @pr).update!(
      planned_files: planned_files.to_json,
      actual_files: filtered_actual.to_json,
      coverage_score: coverage,
      deviation_score: deviation,
      scope_creep_detected: scope_creep
    )

    {
      plan_coverage_score: coverage,
      plan_deviation_score: deviation,
      scope_creep_detected: scope_creep
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
    testable_files = filenames.reject { |f| non_testable_file?(f) }
    return nil if testable_files.empty?

    has_test_files?(filenames)
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
      .where("prs.merged_at >= :lookback OR prs.closed_at >= :lookback", lookback: lookback.iso8601)
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

  # Ratio of successful error recoveries to total errors across correlated sessions.
  # Higher means the agent fixes its own mistakes more often.
  def compute_self_correction_rate
    sessions = correlated_sessions
    return nil if sessions.empty?

    total_errors = sessions.sum(:bash_errors)
    total_successes = sessions.sum(:bash_successes)
    return nil if total_errors == 0 && total_successes == 0

    total_successes.to_f / (total_errors + total_successes)
  end

  # Ratio of files modified to files read across correlated sessions.
  # Higher means the agent stayed focused on relevant files.
  def compute_context_efficiency
    sessions = correlated_sessions
    return nil if sessions.empty?

    total_read = sessions.sum(:files_read_count)
    return nil if total_read == 0

    total_modified = sessions.sum(:files_modified_count)
    total_modified.to_f / total_read
  end

  # Total bash errors across correlated sessions.
  def compute_error_recovery_attempts
    sessions = correlated_sessions
    return nil if sessions.empty?

    sessions.sum(:bash_errors)
  end
  # Fuzzy path matching: handles partial paths, basename-only refs
  def paths_match?(actual, planned)
    norm_actual = normalize_path(actual)
    norm_planned = normalize_path(planned)

    return true if norm_actual == norm_planned
    return true if norm_actual.end_with?("/#{norm_planned}")

    # Basename-only match for planned paths without directory component
    if !planned.include?("/") && File.basename(norm_actual) == norm_planned
      return true
    end

    false
  end

  def normalize_path(path)
    path.delete_prefix("./").delete_prefix("/")
  end

  def non_testable_file?(filename)
    lower = filename.downcase
    base = File.basename(lower)

    NON_TESTABLE_EXTENSIONS.any? { |ext| lower.end_with?(ext) } ||
      NON_TESTABLE_FILENAMES.include?(base) ||
      NON_TESTABLE_PREFIXES.any? { |prefix| lower.start_with?(prefix) }
  end

  def has_test_files?(files)
    files.any? do |f|
      lower = f.downcase
      TEST_FILE_CONTAINS.any? { |pattern| lower.include?(pattern) } ||
        TEST_FILE_PREFIXES.any? { |prefix| lower.start_with?(prefix) }
    end
  end
end
