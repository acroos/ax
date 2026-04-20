class MetricsAggregator
  VALID_WINDOWS = [ 7, 30, 90 ].freeze

  # Maps dashboard metric slug → pr_metrics column name.
  METRIC_COLUMNS = {
    "post-open-commits"  => "post_open_commits",
    "ci-success-rate"    => "ci_success_rate",
    "line-revisit-rate"  => "line_revisit_rate",
    "iteration-depth"    => "iteration_depth",
    "token-cost-per-pr"  => "token_cost_usd",
    "cache-hit-rate"     => "cache_hit_rate",
    "sidechain-rate"     => "sidechain_rate",
    "re-read-rate"       => "re_read_rate",
    "autonomy-score"     => "autonomy_score",
    "review-cycle-time"  => "review_cycle_time_minutes"
  }.freeze

  # @param base_scope [ActiveRecord::Relation] a PrMetrics scope already
  #   filtered to the correct org/repo and `metrics_finalized: true`.
  # @param window_days [Integer] 7, 30, or 90 — controls current/prior
  #   comparison windows and sparkline date range.
  def initialize(base_scope, window_days: 30)
    raise ArgumentError, "window_days must be one of #{VALID_WINDOWS}" unless VALID_WINDOWS.include?(window_days)
    @base_scope = base_scope
    @window_days = window_days
  end

  def call
    now = Time.current
    current_start = now - @window_days.days
    prior_start   = current_start - @window_days.days

    current_scope = @base_scope.where(finalized_at: current_start..now)
    prior_scope   = @base_scope.where(finalized_at: prior_start..current_start)

    current_aggs    = aggregate(current_scope)
    prior_aggs      = aggregate(prior_scope)
    sparkline_data  = sparkline(current_scope, current_start, now)

    total_prs          = current_scope.count
    session_data_count = current_scope.where.not(token_cost_usd: nil).count

    metrics = METRIC_COLUMNS.each_with_object({}) do |(slug, col), hash|
      hash[slug] = {
        current: current_aggs[col],
        prior: prior_aggs[col],
        sparkline: sparkline_data[col] || []
      }
    end

    {
      totalPRs: total_prs,
      sessionDataCount: session_data_count,
      metrics: metrics
    }
  end

  private

  def aggregate(scope)
    return METRIC_COLUMNS.values.index_with { nil } if scope.none?

    picks = METRIC_COLUMNS.values.map { |col| Arel.sql("AVG(#{col})") }
    values = scope.pick(*picks)

    # pick returns a scalar (not array) when given a single expression
    values = [ values ] unless values.is_a?(Array)

    METRIC_COLUMNS.values.zip(values).to_h { |col, val| [ col, val&.to_f ] }
  end

  def sparkline(scope, from, to)
    dates = (from.to_date..to.to_date).to_a

    avg_selects = METRIC_COLUMNS.values.map { |col| Arel.sql("AVG(#{col}) AS avg_#{col}") }

    rows = scope
      .select(Arel.sql("DATE(finalized_at) AS bucket"), *avg_selects)
      .group(Arel.sql("DATE(finalized_at)"))
      .order(Arel.sql("bucket"))

    rows_by_date = rows.index_by { |r| r.bucket.to_date }

    METRIC_COLUMNS.each_with_object({}) do |(_, col), result|
      result[col] = dates.map do |date|
        row = rows_by_date[date]
        { t: date.iso8601, v: row ? row.send("avg_#{col}")&.to_f : nil }
      end
    end
  end
end
