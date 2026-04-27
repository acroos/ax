module SessionSerialization
  extend ActiveSupport::Concern

  # SQL expressions for computing per-session metric values.
  # Mirrors MetricsAggregator::SESSION_METRIC_EXPRESSIONS but returns
  # per-row values (no AVG) via SELECT aliases.
  SESSION_METRIC_SELECTS = [
    "sessions.id",
    "sessions.started_at",
    "sessions.ended_at",
    "sessions.branch",
    "sessions.agent_type",
    "sessions.pushed_by",
    "sessions.primary_model",
    "sessions.repo_id",
    "sessions.turn_count AS iteration_depth",
    "(sessions.input_tokens + sessions.output_tokens) AS total_tokens",
    "sessions.cache_read_input_tokens::float / NULLIF(sessions.input_tokens + sessions.cache_creation_input_tokens + sessions.cache_read_input_tokens, 0) AS cache_hit_rate",
    "sessions.sidechain_messages::float / NULLIF(sessions.message_count + sessions.assistant_message_count, 0) AS sidechain_rate",
    "sessions.total_file_reads::float / NULLIF(sessions.files_read_count, 0) AS re_read_rate",
    "sessions.assistant_message_count::float / NULLIF(sessions.message_count, 0) AS autonomy_score",
    "sessions.peak_context_pct AS peak_context_pct",
    "sessions.agent_tool_calls::float / NULLIF(sessions.total_tool_calls, 0) AS subagent_delegation",
    "(sessions.skill_tool_calls + sessions.mcp_tool_calls)::float / NULLIF(sessions.total_tool_calls, 0) AS skill_tool_usage"
  ].freeze

  private

  def render_sessions(scope)
    per_page = [ (params[:per_page] || 100).to_i, 100 ].min
    scope = apply_agent_type_filter(scope)
    total = scope.count

    sessions = scope
      .select(*SESSION_METRIC_SELECTS.map { |s| Arel.sql(s) }) # brakeman:disable SQLInjection — expressions from frozen constant
      .order(ended_at: :desc)
      .limit(per_page)

    render json: {
      data: sessions.map { |s| serialize_session(s) },
      pagination: { next_cursor: nil, has_more: total > per_page, total: total }
    }
  end

  def serialize_session(session)
    {
      id: session.id,
      started_at: session.started_at,
      ended_at: session.ended_at,
      branch: session.branch,
      agent_type: session.agent_type,
      pushed_by: session.pushed_by,
      primary_model: session.primary_model,
      metrics: {
        iteration_depth: session.respond_to?(:iteration_depth) ? session.iteration_depth&.to_i : nil,
        total_tokens: session.respond_to?(:total_tokens) ? session.total_tokens&.to_i : nil,
        cache_hit_rate: session.respond_to?(:cache_hit_rate) ? session.cache_hit_rate&.to_f : nil,
        sidechain_rate: session.respond_to?(:sidechain_rate) ? session.sidechain_rate&.to_f : nil,
        re_read_rate: session.respond_to?(:re_read_rate) ? session.re_read_rate&.to_f : nil,
        autonomy_score: session.respond_to?(:autonomy_score) ? session.autonomy_score&.to_f : nil,
        peak_context_pct: session.respond_to?(:peak_context_pct) ? session.peak_context_pct&.to_f : nil,
        subagent_delegation: session.respond_to?(:subagent_delegation) ? session.subagent_delegation&.to_f : nil,
        skill_tool_usage: session.respond_to?(:skill_tool_usage) ? session.skill_tool_usage&.to_f : nil
      }
    }
  end
end
