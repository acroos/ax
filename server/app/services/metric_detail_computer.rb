class MetricDetailComputer
  VALID_WINDOWS = [ 7, 30, 90 ].freeze

  # Metric type info needed for distribution bucketing and label formatting.
  METRIC_DEFS = {
    "post-open-commits"    => { value_type: :int, unit: nil },
    "ci-success-rate"      => { value_type: :ratio, unit: nil },
    "line-revisit-rate"    => { value_type: :float, unit: nil },
    "rubber-stamp-rate"    => { value_type: :ratio, unit: nil },
    "task-cycle-time"      => { value_type: :float, unit: "hrs" },
    "pr-throughput"        => { value_type: :float, unit: "/wk" },
    "iteration-depth"      => { value_type: :int, unit: nil },
    "token-cost-per-pr"    => { value_type: :currency, unit: "$" },
    "cache-hit-rate"       => { value_type: :ratio, unit: nil },
    "sidechain-rate"       => { value_type: :ratio, unit: nil },
    "re-read-rate"         => { value_type: :float, unit: nil },
    "autonomy-score"       => { value_type: :float, unit: nil },
    "peak-context-pct"     => { value_type: :ratio, unit: nil },
    "subagent-delegation"  => { value_type: :ratio, unit: nil },
    "skill-tool-usage"     => { value_type: :ratio, unit: nil }
  }.freeze

  ALL_SLUGS = METRIC_DEFS.keys.freeze

  # Pre-computed Arel SQL fragments for session metrics (built at class load
  # from frozen constants, so Brakeman recognises them as safe).
  SESSION_PLUCK_EXPRS = MetricsAggregator::SESSION_METRIC_EXPRESSIONS.transform_values { |expr|
    Arel.sql("(#{expr})") # brakeman:disable SQLInjection — expr from frozen constant
  }.freeze

  SESSION_NOT_NULL_CONDITIONS = MetricsAggregator::SESSION_METRIC_EXPRESSIONS.transform_values { |expr|
    "(#{expr}) IS NOT NULL" # brakeman:disable SQLInjection — expr from frozen constant
  }.freeze

  SESSION_METRIC_VALUE_SELECTS = MetricsAggregator::SESSION_METRIC_EXPRESSIONS.transform_values { |expr|
    Arel.sql("(#{expr}) AS metric_value") # brakeman:disable SQLInjection — expr from frozen constant
  }.freeze

  SESSION_DATE_SQL = MetricsAggregator::SESSION_DATE_SQL.freeze

  SESSION_LABEL_SQL = Arel.sql(
    "COALESCE(sessions.branch, TO_CHAR(#{MetricsAggregator::SESSION_DATE_SQL}, 'Mon DD')) AS label" # brakeman:disable SQLInjection — frozen constant
  ).freeze

  # Pre-computed trend SQL fragments for session metrics.
  SESSION_TREND_SELECTS = MetricsAggregator::SESSION_METRIC_EXPRESSIONS.transform_values { |expr|
    {
      bucket: Arel.sql("DATE(#{MetricsAggregator::SESSION_DATE_SQL}) AS bucket"), # brakeman:disable SQLInjection
      avg: Arel.sql("AVG(#{expr}) AS avg_val"),   # brakeman:disable SQLInjection
      min: Arel.sql("MIN(#{expr}) AS min_val"),   # brakeman:disable SQLInjection
      max: Arel.sql("MAX(#{expr}) AS max_val"),   # brakeman:disable SQLInjection
      cnt: Arel.sql("COUNT(*) AS cnt"),
      group: Arel.sql("DATE(#{MetricsAggregator::SESSION_DATE_SQL})") # brakeman:disable SQLInjection
    }
  }.freeze

  # Pre-computed trend SQL fragments for PR metrics (column-based).
  PR_TREND_SELECTS = MetricsAggregator::PR_METRIC_COLUMNS.transform_values { |col|
    {
      bucket: Arel.sql("DATE(#{MetricsAggregator::TERMINAL_DATE_SQL}) AS bucket"), # brakeman:disable SQLInjection
      avg: Arel.sql("AVG(#{col}) AS avg_val"),  # brakeman:disable SQLInjection
      min: Arel.sql("MIN(#{col}) AS min_val"),  # brakeman:disable SQLInjection
      max: Arel.sql("MAX(#{col}) AS max_val"),  # brakeman:disable SQLInjection
      cnt: Arel.sql("COUNT(*) AS cnt"),
      group: Arel.sql("DATE(#{MetricsAggregator::TERMINAL_DATE_SQL})") # brakeman:disable SQLInjection
    }
  }.freeze

  # Pre-computed Arel fragments for computed PR expressions (rubber-stamp-rate).
  COMPUTED_PR_PLUCK_EXPRS = MetricsAggregator::COMPUTED_PR_EXPRESSIONS.transform_values { |expr|
    Arel.sql("(#{expr})") # brakeman:disable SQLInjection — expr from frozen constant
  }.freeze

  COMPUTED_PR_VALUE_SELECTS = MetricsAggregator::COMPUTED_PR_EXPRESSIONS.transform_values { |expr|
    Arel.sql("(#{expr}) AS metric_value") # brakeman:disable SQLInjection — expr from frozen constant
  }.freeze

  COMPUTED_PR_TREND_SELECTS = MetricsAggregator::COMPUTED_PR_EXPRESSIONS.transform_values { |expr|
    {
      bucket: Arel.sql("DATE(#{MetricsAggregator::TERMINAL_DATE_SQL}) AS bucket"), # brakeman:disable SQLInjection
      avg: Arel.sql("AVG(#{expr}) AS avg_val"),  # brakeman:disable SQLInjection
      min: Arel.sql("MIN(#{expr}) AS min_val"),  # brakeman:disable SQLInjection
      max: Arel.sql("MAX(#{expr}) AS max_val"),  # brakeman:disable SQLInjection
      cnt: Arel.sql("COUNT(*) AS cnt"),
      group: Arel.sql("DATE(#{MetricsAggregator::TERMINAL_DATE_SQL})") # brakeman:disable SQLInjection
    }
  }.freeze

  # Pre-computed Arel fragments for task cycle time.
  TASK_CYCLE_TIME_PLUCK = Arel.sql("(#{MetricsAggregator::TASK_CYCLE_TIME_EXPR})").freeze # brakeman:disable SQLInjection — frozen constant
  TASK_CYCLE_TIME_VALUE_SELECT = Arel.sql("(#{MetricsAggregator::TASK_CYCLE_TIME_EXPR}) AS metric_value").freeze # brakeman:disable SQLInjection
  TASK_CYCLE_TIME_TREND = {
    bucket: Arel.sql("DATE(#{MetricsAggregator::TERMINAL_DATE_SQL}) AS bucket"), # brakeman:disable SQLInjection
    avg: Arel.sql("AVG(#{MetricsAggregator::TASK_CYCLE_TIME_EXPR}) AS avg_val"), # brakeman:disable SQLInjection
    min: Arel.sql("MIN(#{MetricsAggregator::TASK_CYCLE_TIME_EXPR}) AS min_val"), # brakeman:disable SQLInjection
    max: Arel.sql("MAX(#{MetricsAggregator::TASK_CYCLE_TIME_EXPR}) AS max_val"), # brakeman:disable SQLInjection
    cnt: Arel.sql("COUNT(*) AS cnt"),
    group: Arel.sql("DATE(#{MetricsAggregator::TERMINAL_DATE_SQL})") # brakeman:disable SQLInjection
  }.freeze

  BUCKET_ORDER = Arel.sql("bucket").freeze

  # @param metric_slug [String] one of ALL_SLUGS
  # @param pr_scope [ActiveRecord::Relation, nil] PrMetrics scope (finalized, joined to prs)
  # @param session_scope [ActiveRecord::Relation, nil] CodingSession scope
  # @param window_days [Integer] 7, 30, or 90
  def initialize(metric_slug, pr_scope: nil, session_scope: nil, window_days: 30)
    raise ArgumentError, "unknown metric: #{metric_slug}" unless ALL_SLUGS.include?(metric_slug)
    raise ArgumentError, "window_days must be one of #{VALID_WINDOWS}" unless VALID_WINDOWS.include?(window_days)

    @slug = metric_slug
    @pr_scope = pr_scope
    @session_scope = session_scope
    @window_days = window_days
    @is_session = MetricsAggregator::SESSION_METRIC_EXPRESSIONS.key?(metric_slug)
    @is_computed_pr = MetricsAggregator::COMPUTED_PR_EXPRESSIONS.key?(metric_slug)
    @is_task_cycle_time = metric_slug == MetricsAggregator::TASK_CYCLE_TIME_SLUG
    @is_pr_throughput = metric_slug == MetricsAggregator::PR_THROUGHPUT_SLUG
    @metric_def = METRIC_DEFS[metric_slug]
  end

  def call
    if @is_session
      compute_session_detail
    elsif @is_computed_pr
      compute_computed_pr_detail
    elsif @is_task_cycle_time
      compute_task_cycle_time_detail
    elsif @is_pr_throughput
      compute_pr_throughput_detail
    else
      compute_pr_detail
    end
  end

  private

  # ── Session metrics ──────────────────────────────────────────────────

  def compute_session_detail
    expr_sql = SESSION_PLUCK_EXPRS[@slug]
    not_null_cond = SESSION_NOT_NULL_CONDITIONS[@slug]
    date_col = SESSION_DATE_SQL

    now = Time.current
    current_start = now - @window_days.days
    prior_start = current_start - @window_days.days

    base = @session_scope.where(not_null_cond) # brakeman:disable SQLInjection — from frozen constant
    current = base.where("#{date_col} BETWEEN ? AND ?", current_start, now)
    prior = base.where("#{date_col} BETWEEN ? AND ?", prior_start, current_start)

    current_values = current.pluck(expr_sql)
    prior_values = prior.pluck(expr_sql)

    trend = compute_session_trend(current, current_start, now)
    notable = compute_session_notables(current)

    build_response(
      source: "session",
      current_values: current_values,
      prior_values: prior_values,
      total_count: base.count,
      trend: trend,
      notable_highest: notable[:highest],
      notable_lowest: notable[:lowest]
    )
  end

  # ── PR metric columns (from pr_metrics table) ───────────────────────

  def compute_pr_detail
    col = MetricsAggregator::PR_METRIC_COLUMNS[@slug]
    date_sql = MetricsAggregator::TERMINAL_DATE_SQL

    now = Time.current
    current_start = now - @window_days.days
    prior_start = current_start - @window_days.days

    base = @pr_scope.where.not(col => nil)
    current = base.where("#{date_sql} BETWEEN ? AND ?", current_start, now)
    prior = base.where("#{date_sql} BETWEEN ? AND ?", prior_start, current_start)

    current_values = current.pluck(col).map(&:to_f)
    prior_values = prior.pluck(col).map(&:to_f)

    trend = compute_pr_trend(current, current_start, now)
    notable = compute_pr_notables(current, col)

    build_response(
      source: "pr",
      current_values: current_values,
      prior_values: prior_values,
      total_count: base.count,
      trend: trend,
      notable_highest: notable[:highest],
      notable_lowest: notable[:lowest]
    )
  end

  # ── Computed PR expressions (rubber-stamp-rate) ─────────────────────

  def compute_computed_pr_detail
    expr_sql = COMPUTED_PR_PLUCK_EXPRS[@slug]
    date_sql = MetricsAggregator::TERMINAL_DATE_SQL

    now = Time.current
    current_start = now - @window_days.days
    prior_start = current_start - @window_days.days

    base = @pr_scope
    current = base.where("#{date_sql} BETWEEN ? AND ?", current_start, now)
    prior = base.where("#{date_sql} BETWEEN ? AND ?", prior_start, current_start)

    current_values = current.pluck(expr_sql).map(&:to_f)
    prior_values = prior.pluck(expr_sql).map(&:to_f)

    trend = compute_computed_pr_trend(current, current_start, now)
    notable = compute_computed_pr_notables(current)

    build_response(
      source: "pr",
      current_values: current_values,
      prior_values: prior_values,
      total_count: base.count,
      trend: trend,
      notable_highest: notable[:highest],
      notable_lowest: notable[:lowest]
    )
  end

  # ── Task Cycle Time ─────────────────────────────────────────────────

  def compute_task_cycle_time_detail
    date_sql = MetricsAggregator::TERMINAL_DATE_SQL

    now = Time.current
    current_start = now - @window_days.days
    prior_start = current_start - @window_days.days

    base = @pr_scope
      .joins(MetricsAggregator::TASK_CYCLE_TIME_JOIN) # brakeman:disable SQLInjection — frozen constant
      .where("first_sessions.min_started IS NOT NULL")

    current = base.where("#{date_sql} BETWEEN ? AND ?", current_start, now)
    prior = base.where("#{date_sql} BETWEEN ? AND ?", prior_start, current_start)

    current_values = current.pluck(TASK_CYCLE_TIME_PLUCK).compact.map(&:to_f)
    prior_values = prior.pluck(TASK_CYCLE_TIME_PLUCK).compact.map(&:to_f)

    trend = compute_task_cycle_time_trend(current, current_start, now)
    notable = compute_task_cycle_time_notables(current)

    build_response(
      source: "pr",
      current_values: current_values,
      prior_values: prior_values,
      total_count: base.count,
      trend: trend,
      notable_highest: notable[:highest],
      notable_lowest: notable[:lowest]
    )
  end

  # ── PR Throughput ───────────────────────────────────────────────────

  def compute_pr_throughput_detail
    date_sql = MetricsAggregator::TERMINAL_DATE_SQL
    weeks = @window_days / 7.0

    now = Time.current
    current_start = now - @window_days.days
    prior_start = current_start - @window_days.days

    merged_scope = @pr_scope.where.not(prs: { merged_at: nil })
    current = merged_scope.where("#{date_sql} BETWEEN ? AND ?", current_start, now)
    prior = merged_scope.where("#{date_sql} BETWEEN ? AND ?", prior_start, current_start)

    # Per-contributor throughput values (PRs/week)
    current_by_author = current.group("prs.author").count
    prior_by_author = prior.group("prs.author").count

    current_values = current_by_author.values.map { |count| count / weeks }
    prior_values = prior_by_author.values.map { |count| count / weeks }

    trend = compute_pr_throughput_trend(current, current_start, now)

    # Notable: highest/lowest throughput contributors
    sorted = current_by_author.sort_by { |_, count| -count }
    notable_highest = sorted.first(3).map { |author, count| { id: author, label: author, value: (count / weeks).round(2) } }
    notable_lowest = sorted.last(3).reverse.map { |author, count| { id: author, label: author, value: (count / weeks).round(2) } }
    highest_ids = notable_highest.map { |h| h[:id] }.to_set
    notable_lowest = notable_lowest.reject { |l| highest_ids.include?(l[:id]) }

    build_response(
      source: "pr",
      current_values: current_values,
      prior_values: prior_values,
      total_count: current_by_author.size + prior_by_author.size,
      trend: trend,
      notable_highest: notable_highest,
      notable_lowest: notable_lowest
    )
  end

  # ── Shared computation ─────────────────────────────────────────────

  def build_response(source:, current_values:, prior_values:, total_count:, trend:, notable_highest:, notable_lowest:)
    {
      metric: @slug,
      source: source,
      range: "#{@window_days}d",
      count: current_values.length,
      total_count: total_count,
      stats: compute_stats(current_values),
      prior_stats: prior_values.any? ? compute_stats(prior_values) : nil,
      trend: trend,
      distribution: compute_distribution(current_values),
      notable_highest: notable_highest,
      notable_lowest: notable_lowest
    }
  end

  def compute_stats(values)
    return nil if values.empty?
    sorted = values.sort
    {
      avg: values.sum / values.length.to_f,
      p10: percentile_cont(sorted, 0.10),
      p50: percentile_cont(sorted, 0.50),
      p90: percentile_cont(sorted, 0.90)
    }
  end

  def percentile_cont(sorted, p)
    return sorted[0] if sorted.length == 1
    idx = p * (sorted.length - 1)
    lower = idx.floor
    upper = idx.ceil
    return sorted[lower].to_f if lower == upper
    sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
  end

  # ── Trend helpers ───────────────────────────────────────────────────

  def compute_session_trend(scope, from, to)
    frags = SESSION_TREND_SELECTS[@slug]
    rows = scope
      .select(frags[:bucket], frags[:avg], frags[:min], frags[:max], frags[:cnt])
      .group(frags[:group])
      .order(BUCKET_ORDER)
    format_trend_rows(rows, from, to)
  end

  def compute_pr_trend(scope, from, to)
    frags = PR_TREND_SELECTS[@slug]
    rows = scope
      .select(frags[:bucket], frags[:avg], frags[:min], frags[:max], frags[:cnt])
      .group(frags[:group])
      .order(BUCKET_ORDER)
    format_trend_rows(rows, from, to)
  end

  def compute_computed_pr_trend(scope, from, to)
    frags = COMPUTED_PR_TREND_SELECTS[@slug]
    rows = scope
      .select(frags[:bucket], frags[:avg], frags[:min], frags[:max], frags[:cnt])
      .group(frags[:group])
      .order(BUCKET_ORDER)
    format_trend_rows(rows, from, to)
  end

  def compute_task_cycle_time_trend(scope, from, to)
    frags = TASK_CYCLE_TIME_TREND
    rows = scope
      .select(frags[:bucket], frags[:avg], frags[:min], frags[:max], frags[:cnt])
      .group(frags[:group])
      .order(BUCKET_ORDER)
    format_trend_rows(rows, from, to)
  end

  def compute_pr_throughput_trend(scope, from, to)
    # Daily merged PR counts
    date_sql = MetricsAggregator::TERMINAL_DATE_SQL
    rows = scope
      .select(Arel.sql("DATE(#{date_sql}) AS bucket"), Arel.sql("COUNT(*) AS avg_val"), Arel.sql("COUNT(*) AS min_val"), Arel.sql("COUNT(*) AS max_val"), Arel.sql("COUNT(*) AS cnt"))
      .group(Arel.sql("DATE(#{date_sql})"))
      .order(BUCKET_ORDER)
    format_trend_rows(rows, from, to)
  end

  def format_trend_rows(rows, from, to)
    rows_by_date = rows.index_by { |r| r.bucket.to_date }

    (from.to_date..to.to_date).map do |date|
      row = rows_by_date[date]
      if row
        { date: date.iso8601, avg: row.avg_val.to_f, min: row.min_val.to_f, max: row.max_val.to_f, count: row.cnt.to_i }
      else
        { date: date.iso8601, avg: nil, min: nil, max: nil, count: 0 }
      end
    end
  end

  # ── Distribution ────────────────────────────────────────────────────

  def compute_distribution(values)
    return [] if values.empty?

    sorted = values.sort
    min_val = sorted.first.to_f
    max_val = sorted.last.to_f
    vtype = @metric_def[:value_type]

    if vtype == :ratio
      ratio_distribution(values)
    else
      numeric_distribution(values, min_val, max_val, vtype)
    end
  end

  def ratio_distribution(values)
    bands = Array.new(10) { |i| { label: "#{i * 10}\u2013#{(i + 1) * 10}%", count: 0 } }
    values.each { |v| bands[[ (v * 10).floor, 9 ].min][:count] += 1 }

    first = bands.index { |b| b[:count] > 0 }
    last = bands.rindex { |b| b[:count] > 0 }
    return [] unless first && last

    trimmed = bands[first..last]
    max_count = trimmed.map { |b| b[:count] }.max
    trimmed.map { |b| { label: b[:label], count: b[:count], pct: max_count > 0 ? b[:count].to_f / max_count : 0.0 } }
  end

  def numeric_distribution(values, min_val, max_val, vtype)
    range = max_val - min_val
    if range == 0
      return [ { label: format_value(min_val, vtype), count: values.length, pct: 1.0 } ]
    end

    target_buckets = 6
    step = if vtype == :int
      [ 1, (range.to_f / target_buckets).ceil ].max
    else
      raw = range / target_buckets
      mag = 10**Math.log10(raw).floor
      (raw / mag).ceil * mag
    end

    bucket_start = (min_val / step).floor * step
    buckets = []
    lo = bucket_start
    while lo <= max_val
      hi = lo + step
      is_last = hi > max_val
      count = values.count { |v| v >= lo && (is_last ? v <= hi : v < hi) }
      buckets << { lo: lo, hi: hi, count: count }
      lo = hi
    end

    first = buckets.index { |b| b[:count] > 0 }
    last = buckets.rindex { |b| b[:count] > 0 }
    return [] unless first && last

    trimmed = buckets[first..last]
    max_count = trimmed.map { |b| b[:count] }.max
    trimmed.map do |b|
      label = format_bucket_label(b[:lo], b[:hi], step, vtype)
      { label: label, count: b[:count], pct: max_count > 0 ? b[:count].to_f / max_count : 0.0 }
    end
  end

  def format_bucket_label(lo, hi, step, vtype)
    if vtype == :int && step == 1
      lo.round.to_s
    elsif @metric_def[:unit] == "$"
      "$#{lo.round}\u2013$#{hi.round}"
    elsif vtype == :int
      "#{lo.round}\u2013#{(hi - 1).round}"
    else
      "#{'%.1f' % lo}\u2013#{'%.1f' % hi}"
    end
  end

  def format_value(val, vtype)
    case vtype
    when :int then val.round.to_s
    when :currency then val < 0.01 ? "<$0.01" : "$#{'%.2f' % val}"
    else "#{'%.2f' % val}"
    end
  end

  # ── Notable items ──────────────────────────────────────────────────

  NOTABLE_ORDER_DESC = Arel.sql("metric_value DESC NULLS LAST").freeze
  NOTABLE_ORDER_ASC  = Arel.sql("metric_value ASC NULLS LAST").freeze

  def compute_session_notables(scope)
    metric_value_sql = SESSION_METRIC_VALUE_SELECTS[@slug]

    highest = scope
      .select("sessions.id", metric_value_sql, SESSION_LABEL_SQL)
      .order(NOTABLE_ORDER_DESC)
      .limit(3)
      .map { |s| { id: s.id, label: s.label, value: s.metric_value.to_f } }

    lowest = scope
      .select("sessions.id", metric_value_sql, SESSION_LABEL_SQL)
      .order(NOTABLE_ORDER_ASC)
      .limit(3)
      .map { |s| { id: s.id, label: s.label, value: s.metric_value.to_f } }

    highest_ids = highest.map { |h| h[:id] }.to_set
    lowest = lowest.reject { |l| highest_ids.include?(l[:id]) }

    { highest: highest, lowest: lowest }
  end

  def compute_pr_notables(scope, col)
    highest = scope
      .joins(:pr)
      .select("pr_metrics.id", "prs.id AS pr_id", "prs.number", "prs.title", "prs.state", "#{col} AS metric_value")
      .order("#{col} DESC")
      .limit(3)
      .map { |r| { id: r.pr_id, number: r.number, title: r.title, value: r.metric_value.to_f, state: r.state } }

    lowest = scope
      .joins(:pr)
      .select("pr_metrics.id", "prs.id AS pr_id", "prs.number", "prs.title", "prs.state", "#{col} AS metric_value")
      .order("#{col} ASC")
      .limit(3)
      .map { |r| { id: r.pr_id, number: r.number, title: r.title, value: r.metric_value.to_f, state: r.state } }

    highest_ids = highest.map { |h| h[:id] }.to_set
    lowest = lowest.reject { |l| highest_ids.include?(l[:id]) }

    { highest: highest, lowest: lowest }
  end

  def compute_computed_pr_notables(scope)
    metric_value_sql = COMPUTED_PR_VALUE_SELECTS[@slug]

    highest = scope
      .joins(:pr)
      .select("pr_metrics.id", "prs.id AS pr_id", "prs.number", "prs.title", "prs.state", metric_value_sql)
      .order(NOTABLE_ORDER_DESC)
      .limit(3)
      .map { |r| { id: r.pr_id, number: r.number, title: r.title, value: r.metric_value.to_f, state: r.state } }

    lowest = scope
      .joins(:pr)
      .select("pr_metrics.id", "prs.id AS pr_id", "prs.number", "prs.title", "prs.state", metric_value_sql)
      .order(NOTABLE_ORDER_ASC)
      .limit(3)
      .map { |r| { id: r.pr_id, number: r.number, title: r.title, value: r.metric_value.to_f, state: r.state } }

    highest_ids = highest.map { |h| h[:id] }.to_set
    lowest = lowest.reject { |l| highest_ids.include?(l[:id]) }

    { highest: highest, lowest: lowest }
  end

  def compute_task_cycle_time_notables(scope)
    highest = scope
      .joins(:pr)
      .select("pr_metrics.id", "prs.id AS pr_id", "prs.number", "prs.title", "prs.state", TASK_CYCLE_TIME_VALUE_SELECT)
      .order(NOTABLE_ORDER_DESC)
      .limit(3)
      .map { |r| { id: r.pr_id, number: r.number, title: r.title, value: r.metric_value.to_f, state: r.state } }

    lowest = scope
      .joins(:pr)
      .select("pr_metrics.id", "prs.id AS pr_id", "prs.number", "prs.title", "prs.state", TASK_CYCLE_TIME_VALUE_SELECT)
      .order(NOTABLE_ORDER_ASC)
      .limit(3)
      .map { |r| { id: r.pr_id, number: r.number, title: r.title, value: r.metric_value.to_f, state: r.state } }

    highest_ids = highest.map { |h| h[:id] }.to_set
    lowest = lowest.reject { |l| highest_ids.include?(l[:id]) }

    { highest: highest, lowest: lowest }
  end
end
