module Api
  module V1
    class PrsController < BaseController
      include PrSerialization
      include SessionSerialization

      before_action :require_session_auth!

      def show
        pr = Pr
          .joins(repo: :organization)
          .left_joins(:pr_metrics)
          .includes(:pr_metrics, repo: :organization)
          .find(params[:id])

        # Verify the current user has access to this PR's org
        org = pr.repo.organization
        head(:forbidden) and return unless current_user&.member_of?(org)

        @org = org
        cutoff = history_cutoff
        if cutoff && pr.created_at_source.present?
          head(:forbidden) and return if pr.created_at_source < cutoff
        end

        render json: pr_with_session_metrics(pr)
      end

      private

      # Extends the base pr_with_metrics with session-derived metrics
      # computed on-the-fly from linked sessions.
      def pr_with_session_metrics(pr)
        base = pr_with_metrics(pr)
        session_metrics = compute_session_metrics_for_pr(pr)

        if base[:metrics]
          base[:metrics].merge!(session_metrics)
        else
          base[:metrics] = session_metrics
        end

        base
      end

      def compute_session_metrics_for_pr(pr)
        sessions = CodingSession
          .joins(:session_prs)
          .where(session_prs: { pr_id: pr.id })

        return {} if sessions.empty?

        # Use the same SQL expressions as MetricsAggregator / SessionSerialization
        result = sessions.pick(
          Arel.sql("MAX(sessions.turn_count)"),                                                                                      # brakeman:disable SQLInjection
          Arel.sql("SUM(sessions.input_tokens + sessions.output_tokens)"),                                                           # brakeman:disable SQLInjection
          Arel.sql("SUM(sessions.cache_read_input_tokens)::float / NULLIF(SUM(sessions.input_tokens) + SUM(sessions.cache_creation_input_tokens) + SUM(sessions.cache_read_input_tokens), 0)"), # brakeman:disable SQLInjection
          Arel.sql("(SUM(sessions.sidechain_messages) FILTER (WHERE sessions.sidechain_messages IS NOT NULL))::float / NULLIF(SUM(sessions.message_count + sessions.assistant_message_count) FILTER (WHERE sessions.sidechain_messages IS NOT NULL), 0)"), # brakeman:disable SQLInjection
          Arel.sql("SUM(sessions.total_file_reads)::float / NULLIF(SUM(sessions.files_read_count), 0)"),                             # brakeman:disable SQLInjection
          Arel.sql("SUM(sessions.assistant_message_count)::float / NULLIF(SUM(sessions.message_count), 0)"),                         # brakeman:disable SQLInjection
          Arel.sql("MAX(sessions.peak_context_pct)"),                                                                                # brakeman:disable SQLInjection
          Arel.sql("SUM(sessions.agent_tool_calls)::float / NULLIF(SUM(sessions.total_tool_calls), 0)"),                             # brakeman:disable SQLInjection
          Arel.sql("SUM(sessions.skill_tool_calls + sessions.mcp_tool_calls)::float / NULLIF(SUM(sessions.total_tool_calls), 0)")    # brakeman:disable SQLInjection
        )

        result = [ result ] unless result.is_a?(Array)

        {
          iteration_depth: result[0]&.to_i,
          total_tokens: result[1]&.to_i,
          cache_hit_rate: result[2]&.to_f,
          sidechain_rate: result[3]&.to_f,
          re_read_rate: result[4]&.to_f,
          autonomy_score: result[5]&.to_f,
          peak_context_pct: result[6]&.to_f,
          subagent_delegation: result[7]&.to_f,
          skill_tool_usage: result[8]&.to_f
        }.compact
      end
    end
  end
end
