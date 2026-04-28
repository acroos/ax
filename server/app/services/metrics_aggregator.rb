class MetricsAggregator
  VALID_WINDOWS = [ 7, 30, 90 ].freeze

  # PR-derived metrics — read from pr_metrics (finalized PRs only).
  PR_METRIC_COLUMNS = {
    "post-open-commits"  => "post_open_commits",
    "ci-success-rate"    => "ci_success_rate",
    "line-revisit-rate"  => "line_revisit_rate"
  }.freeze

  # PR-derived metrics — computed from prs table columns at query time.
  # The pr_scope already joins prs, so these expressions can reference prs.* columns.
  COMPUTED_PR_EXPRESSIONS = {
    "rubber-stamp-rate" => "CASE WHEN prs.additions + prs.deletions >= 50 AND EXTRACT(EPOCH FROM (prs.merged_at - prs.created_at_source)) / 60.0 <= 5 THEN 1.0 ELSE 0.0 END"
  }.freeze

  # Task cycle time — hours from first session start to PR terminal date.
  # Requires joining session data via session_prs.
  TASK_CYCLE_TIME_SLUG = "task-cycle-time"
  TASK_CYCLE_TIME_EXPR = "EXTRACT(EPOCH FROM (COALESCE(prs.merged_at, prs.closed_at) - first_sessions.min_started)) / 3600.0".freeze

  # PR throughput — special aggregate (merged PRs / contributors / weeks).
  PR_THROUGHPUT_SLUG = "pr-throughput"

  # Session-derived metrics — computed directly from the sessions table.
  # Each maps dashboard slug → { sql: SQL expression, requires: fields agent must support }.
  # When agent_type is set, metrics whose :requires fields are not all supported by that
  # agent are filtered out and returned as { current: nil, prior: nil, sparkline: [] }.
  SESSION_METRIC_EXPRESSIONS = {
    "iteration-depth"      => { sql: "turn_count", requires: [] },
    "token-cost-per-pr"    => { sql: "input_tokens + output_tokens", requires: %i[input_tokens output_tokens] },
    "cache-hit-rate"       => { sql: "cache_read_input_tokens::float / NULLIF(input_tokens + cache_creation_input_tokens + cache_read_input_tokens, 0)", requires: %i[input_tokens cache_read_input_tokens cache_creation_input_tokens] },
    "sidechain-rate"       => { sql: "CASE WHEN sidechain_messages IS NOT NULL THEN sidechain_messages::float / NULLIF(message_count + assistant_message_count, 0) END", requires: %i[sidechain_messages] },
    "re-read-rate"         => { sql: "total_file_reads::float / NULLIF(files_read_count, 0)", requires: %i[total_file_reads] },
    "autonomy-score"       => { sql: "assistant_message_count::float / NULLIF(message_count, 0)", requires: [] },
    "peak-context-pct"     => { sql: "peak_context_pct", requires: %i[peak_context_pct] },
    "subagent-delegation"  => { sql: "agent_tool_calls::float / NULLIF(total_tool_calls, 0)", requires: %i[agent_tool_calls] },
    "skill-tool-usage"     => { sql: "(skill_tool_calls + mcp_tool_calls)::float / NULLIF(total_tool_calls, 0)", requires: %i[skill_tool_calls mcp_tool_calls] }
  }.freeze

  # Pre-computed Arel SQL fragments for all agent-type/nil combinations.
  # Keyed by agent_type (nil = unfiltered). Built at class load from frozen constants;
  # no user input is ever interpolated.
  # rubocop:disable Metrics/BlockLength
  SESSION_METRIC_BY_AGENT = begin
    all_agent_keys = [ nil ] + AgentRegistry::VALID_IDS
    all_agent_keys.each_with_object({}) do |agent_type, h|
      filtered = SESSION_METRIC_EXPRESSIONS.select do |_slug, meta|
        agent_type.nil? || meta[:requires].all? { |f| AgentRegistry.supports_field?(agent_type, f) }
      end
      avg_picks = filtered.map { |_slug, meta| Arel.sql("AVG(#{meta[:sql]})") } # brakeman:disable SQLInjection — sql from SESSION_METRIC_EXPRESSIONS frozen constant
      sparkline_selects = filtered.map { |slug, meta| Arel.sql("AVG(#{meta[:sql]}) AS avg_#{slug.tr('-', '_')}") } # brakeman:disable SQLInjection
      sparkline_aliases = filtered.keys.map { |slug| "avg_#{slug.tr('-', '_')}" }
      h[agent_type] = {
        metrics: filtered,
        avg_picks: avg_picks,
        sparkline_selects: sparkline_selects,
        sparkline_aliases: sparkline_aliases
      }
    end
  end.freeze
  # rubocop:enable Metrics/BlockLength

  # Pre-computed Arel SQL fragments for computed PR expressions.
  COMPUTED_PR_AVG_PICKS = COMPUTED_PR_EXPRESSIONS.values.map { |expr|
    Arel.sql("AVG(#{expr})") # brakeman:disable SQLInjection — expr is from frozen constant
  }.freeze

  COMPUTED_PR_SPARKLINE_SELECTS = COMPUTED_PR_EXPRESSIONS.map { |slug, expr|
    Arel.sql("AVG(#{expr}) AS avg_#{slug.tr('-', '_')}") # brakeman:disable SQLInjection
  }.freeze

  COMPUTED_PR_SPARKLINE_ALIASES = COMPUTED_PR_EXPRESSIONS.keys.map { |slug|
    "avg_#{slug.tr('-', '_')}"
  }.freeze

  # Pre-computed Arel SQL fragments for task cycle time.
  TASK_CYCLE_TIME_AVG = Arel.sql("AVG(#{TASK_CYCLE_TIME_EXPR})").freeze # brakeman:disable SQLInjection — frozen constant
  TASK_CYCLE_TIME_SPARKLINE_SELECT = Arel.sql("AVG(#{TASK_CYCLE_TIME_EXPR}) AS avg_task_cycle_time").freeze # brakeman:disable SQLInjection

  # Combined slug list preserving dashboard display order.
  ALL_SLUGS = (PR_METRIC_COLUMNS.keys + COMPUTED_PR_EXPRESSIONS.keys + [ TASK_CYCLE_TIME_SLUG, PR_THROUGHPUT_SLUG ] + SESSION_METRIC_EXPRESSIONS.keys).freeze

  # SQL expression for the date a PR reached terminal state.
  # Uses the PR's merge/close date (not finalized_at, which is an internal
  # processing timestamp). All callers must join the prs table.
  TERMINAL_DATE_SQL = "COALESCE(prs.merged_at, prs.closed_at)".freeze

  # SQL expression for session end date (used for windowing and bucketing).
  SESSION_DATE_SQL = "sessions.ended_at".freeze

  SESSION_BUCKET_SQL = "DATE(#{SESSION_DATE_SQL})".freeze

  # @param pr_scope [ActiveRecord::Relation] a PrMetrics scope already
  #   filtered to the correct org/repo and `metrics_finalized: true`.
  #   Must include a join to the prs table.
  # @param session_scope [ActiveRecord::Relation] a CodingSession scope
  #   filtered to the correct org/repo/user/team. Must reference the
  #   sessions table directly (no joins required).
  # @param window_days [Integer] 7, 30, or 90 — controls current/prior
  #   comparison windows and sparkline date range.
  def initialize(pr_scope, session_scope:, window_days: 30, agent_type: nil)
    raise ArgumentError, "window_days must be one of #{VALID_WINDOWS}" unless VALID_WINDOWS.include?(window_days)
    @pr_scope = pr_scope
    @session_scope = session_scope
    @window_days = window_days
    @agent_type = agent_type
  end

  def call
    now = Time.current
    current_start = now - @window_days.days
    prior_start   = current_start - @window_days.days

    # PR scopes windowed by merge/close date
    pr_current = @pr_scope.where("#{TERMINAL_DATE_SQL} BETWEEN ? AND ?", current_start, now)
    pr_prior   = @pr_scope.where("#{TERMINAL_DATE_SQL} BETWEEN ? AND ?", prior_start, current_start)

    # Session scopes windowed by session end date
    sess_current = @session_scope.where("#{SESSION_DATE_SQL} BETWEEN ? AND ?", current_start, now)
    sess_prior   = @session_scope.where("#{SESSION_DATE_SQL} BETWEEN ? AND ?", prior_start, current_start)

    # PR metric columns (from pr_metrics table)
    pr_current_aggs   = aggregate_pr(pr_current)
    pr_prior_aggs     = aggregate_pr(pr_prior)
    pr_sparkline      = sparkline_pr(pr_current, current_start, now)

    # Computed PR expressions (rubber-stamp-rate)
    computed_pr_current = aggregate_computed_pr(pr_current)
    computed_pr_prior   = aggregate_computed_pr(pr_prior)
    computed_pr_spark   = sparkline_computed_pr(pr_current, current_start, now)

    # Task cycle time (requires session join)
    tct_current = aggregate_task_cycle_time(pr_current)
    tct_prior   = aggregate_task_cycle_time(pr_prior)
    tct_spark   = sparkline_task_cycle_time(pr_current, current_start, now)

    # PR throughput (special aggregate)
    throughput_current = compute_pr_throughput(pr_current)
    throughput_prior   = compute_pr_throughput(pr_prior)
    throughput_spark   = sparkline_pr_throughput(pr_current, current_start, now)

    # Session metrics
    sess_current_aggs = aggregate_session(sess_current)
    sess_prior_aggs   = aggregate_session(sess_prior)
    sess_sparkline    = sparkline_session(sess_current, current_start, now)

    total_prs      = pr_current.count
    total_sessions = sess_current.count

    metrics = {}

    PR_METRIC_COLUMNS.each do |slug, col|
      metrics[slug] = {
        current: pr_current_aggs[col],
        prior: pr_prior_aggs[col],
        sparkline: pr_sparkline[col] || []
      }
    end

    COMPUTED_PR_EXPRESSIONS.each_key do |slug|
      metrics[slug] = {
        current: computed_pr_current[slug],
        prior: computed_pr_prior[slug],
        sparkline: computed_pr_spark[slug] || []
      }
    end

    metrics[TASK_CYCLE_TIME_SLUG] = {
      current: tct_current,
      prior: tct_prior,
      sparkline: tct_spark
    }

    metrics[PR_THROUGHPUT_SLUG] = {
      current: throughput_current,
      prior: throughput_prior,
      sparkline: throughput_spark
    }

    # All session metric slugs are always present in the response.
    # Slugs unsupported by the current agent_type are returned as nil/[].
    SESSION_METRIC_EXPRESSIONS.each_key do |slug|
      metrics[slug] = {
        current: sess_current_aggs[slug],
        prior: sess_prior_aggs[slug],
        sparkline: sess_sparkline[slug] || []
      }
    end

    {
      totalPRs: total_prs,
      totalSessions: total_sessions,
      sessionDataCount: total_sessions,
      metrics: metrics
    }
  end

  # Builds the LEFT JOIN fragment for task cycle time, optionally filtering
  # by agent_type. Validates agent_type against the registry before interpolating.
  # The SQL strings are constructed as single-line strings to match the original
  # hardcoded constant format byte-for-byte.
  TASK_CYCLE_TIME_JOIN_BASE = "LEFT JOIN (SELECT session_prs.pr_id, MIN(sessions.started_at) AS min_started FROM session_prs JOIN sessions ON sessions.id = session_prs.session_id GROUP BY session_prs.pr_id) first_sessions ON first_sessions.pr_id = prs.id".freeze
  TASK_CYCLE_TIME_JOIN_FILTERED_PREFIX = "LEFT JOIN (SELECT session_prs.pr_id, MIN(sessions.started_at) AS min_started FROM session_prs JOIN sessions ON sessions.id = session_prs.session_id WHERE sessions.agent_type = ".freeze
  TASK_CYCLE_TIME_JOIN_FILTERED_SUFFIX = " GROUP BY session_prs.pr_id) first_sessions ON first_sessions.pr_id = prs.id".freeze

  def self.task_cycle_time_join_for(agent_type)
    return TASK_CYCLE_TIME_JOIN_BASE if agent_type.nil?

    # Validate before interpolating — unknown agent_type falls back to no filter.
    unless AgentRegistry::VALID_IDS.include?(agent_type)
      return TASK_CYCLE_TIME_JOIN_BASE
    end

    quoted = ActiveRecord::Base.connection.quote(agent_type)
    # agent_type validated against AgentRegistry::VALID_IDS above; quoted via connection.quote
    # brakeman:disable_next_line SQLInjection
    "#{TASK_CYCLE_TIME_JOIN_FILTERED_PREFIX}#{quoted}#{TASK_CYCLE_TIME_JOIN_FILTERED_SUFFIX}"
  end

  private

  # Returns the pre-computed metadata for the current agent_type from SESSION_METRIC_BY_AGENT.
  # Falls back to the nil (unfiltered) entry for any unrecognized agent_type.
  def session_metrics_cache
    SESSION_METRIC_BY_AGENT.fetch(@agent_type, SESSION_METRIC_BY_AGENT[nil])
  end

  def session_metrics_for_query
    session_metrics_cache[:metrics]
  end

  def session_avg_picks
    session_metrics_cache[:avg_picks]
  end

  def session_sparkline_selects
    session_metrics_cache[:sparkline_selects]
  end

  def session_sparkline_aliases
    session_metrics_cache[:sparkline_aliases]
  end

  # ----- PR metric column helpers -----

  def aggregate_pr(scope)
    cols = PR_METRIC_COLUMNS.values
    return cols.index_with { nil } if scope.none?

    picks = cols.map { |col| Arel.sql("AVG(#{col})") }
    values = scope.pick(*picks)
    values = [ values ] unless values.is_a?(Array)
    cols.zip(values).to_h { |col, val| [ col, val&.to_f ] }
  end

  def sparkline_pr(scope, from, to)
    dates = (from.to_date..to.to_date).to_a
    cols = PR_METRIC_COLUMNS.values

    avg_selects = cols.map { |col| Arel.sql("AVG(#{col}) AS avg_#{col}") }
    rows = scope
      .select(Arel.sql("DATE(#{TERMINAL_DATE_SQL}) AS bucket"), *avg_selects)
      .group(Arel.sql("DATE(#{TERMINAL_DATE_SQL})"))
      .order(Arel.sql("bucket"))
    rows_by_date = rows.index_by { |r| r.bucket.to_date }

    cols.each_with_object({}) do |col, result|
      result[col] = dates.map do |date|
        row = rows_by_date[date]
        { t: date.iso8601, v: row ? row.send("avg_#{col}")&.to_f : nil }
      end
    end
  end

  # ----- Computed PR expression helpers (rubber-stamp-rate) -----

  def aggregate_computed_pr(scope)
    return COMPUTED_PR_EXPRESSIONS.keys.index_with { nil } if scope.none?

    values = scope.pick(*COMPUTED_PR_AVG_PICKS)
    values = [ values ] unless values.is_a?(Array)

    COMPUTED_PR_EXPRESSIONS.keys.zip(values).to_h { |slug, val| [ slug, val&.to_f ] }
  end

  def sparkline_computed_pr(scope, from, to)
    dates = (from.to_date..to.to_date).to_a

    rows = scope
      .select(Arel.sql("DATE(#{TERMINAL_DATE_SQL}) AS bucket"), *COMPUTED_PR_SPARKLINE_SELECTS)
      .group(Arel.sql("DATE(#{TERMINAL_DATE_SQL})"))
      .order(Arel.sql("bucket"))
    rows_by_date = rows.index_by { |r| r.bucket.to_date }

    COMPUTED_PR_EXPRESSIONS.keys.zip(COMPUTED_PR_SPARKLINE_ALIASES).each_with_object({}) do |(slug, col_alias), result|
      result[slug] = dates.map do |date|
        row = rows_by_date[date]
        { t: date.iso8601, v: row ? row.send(col_alias)&.to_f : nil }
      end
    end
  end

  # ----- Task Cycle Time helpers -----

  def aggregate_task_cycle_time(scope)
    joined = scope
      .joins(self.class.task_cycle_time_join_for(@agent_type)) # brakeman:disable SQLInjection — validated in task_cycle_time_join_for
      .where("first_sessions.min_started IS NOT NULL")
    return nil if joined.none?

    joined.pick(TASK_CYCLE_TIME_AVG)&.to_f
  end

  def sparkline_task_cycle_time(scope, from, to)
    dates = (from.to_date..to.to_date).to_a

    joined = scope
      .joins(self.class.task_cycle_time_join_for(@agent_type)) # brakeman:disable SQLInjection — validated in task_cycle_time_join_for
      .where("first_sessions.min_started IS NOT NULL")

    rows = joined
      .select(Arel.sql("DATE(#{TERMINAL_DATE_SQL}) AS bucket"), TASK_CYCLE_TIME_SPARKLINE_SELECT)
      .group(Arel.sql("DATE(#{TERMINAL_DATE_SQL})"))
      .order(Arel.sql("bucket"))
    rows_by_date = rows.index_by { |r| r.bucket.to_date }

    dates.map do |date|
      row = rows_by_date[date]
      { t: date.iso8601, v: row ? row.avg_task_cycle_time&.to_f : nil }
    end
  end

  # ----- PR Throughput helpers -----

  def compute_pr_throughput(scope)
    merged = scope.where.not(prs: { merged_at: nil })
    merged_count = merged.count
    return nil if merged_count == 0

    contributors = merged.distinct.count("prs.author")
    contributors = 1 if contributors == 0
    weeks = @window_days / 7.0

    merged_count.to_f / contributors / weeks
  end

  def sparkline_pr_throughput(scope, from, to)
    dates = (from.to_date..to.to_date).to_a
    merged = scope.where.not(prs: { merged_at: nil })

    rows = merged
      .select(Arel.sql("DATE(#{TERMINAL_DATE_SQL}) AS bucket"), Arel.sql("COUNT(*) AS cnt"))
      .group(Arel.sql("DATE(#{TERMINAL_DATE_SQL})"))
      .order(Arel.sql("bucket"))
    rows_by_date = rows.index_by { |r| r.bucket.to_date }

    dates.map do |date|
      row = rows_by_date[date]
      { t: date.iso8601, v: row ? row.cnt.to_f : nil }
    end
  end

  # ----- Session-derived metric helpers -----

  def aggregate_session(scope)
    active_metrics = session_metrics_for_query
    # Build base nil hash for ALL slugs (ensures stable keys regardless of filtering)
    all_nil = SESSION_METRIC_EXPRESSIONS.keys.index_with { nil }
    return all_nil if scope.none? || active_metrics.empty?

    picks = session_avg_picks
    values = scope.pick(*picks)
    values = [ values ] unless values.is_a?(Array)

    supported = active_metrics.keys.zip(values).to_h { |slug, val| [ slug, val&.to_f ] }
    all_nil.merge(supported)
  end

  def sparkline_session(scope, from, to)
    dates = (from.to_date..to.to_date).to_a
    # Build base empty sparkline for ALL slugs
    all_empty = SESSION_METRIC_EXPRESSIONS.keys.index_with { [] }

    active_metrics = session_metrics_for_query
    return all_empty if active_metrics.empty?

    selects = session_sparkline_selects
    rows = scope
      .select(Arel.sql("#{SESSION_BUCKET_SQL} AS bucket"), *selects)
      .group(Arel.sql(SESSION_BUCKET_SQL))
      .order(Arel.sql("bucket"))
    rows_by_date = rows.index_by { |r| r.bucket.to_date }

    aliases = session_sparkline_aliases
    supported = active_metrics.keys.zip(aliases).each_with_object({}) do |(slug, col_alias), result|
      result[slug] = dates.map do |date|
        row = rows_by_date[date]
        { t: date.iso8601, v: row ? row.send(col_alias)&.to_f : nil }
      end
    end

    all_empty.merge(supported)
  end
end
