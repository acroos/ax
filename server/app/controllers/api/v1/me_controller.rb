module Api
  module V1
    class MeController < BaseController
      include PrSerialization
      include SessionSerialization
      include MetricDetailAction

      before_action :require_session_auth!
      before_action :find_org!

      def prs
        scope = Pr
          .joins(:repo)
          .where(repos: { organization_id: @org.id }, author: current_user.github_username)
          .left_joins(:pr_metrics)
          .includes(:pr_metrics, :repo, :session_prs)
          .order(created_at: :desc, id: :desc)

        render_paginated_prs(scope)
      end

      def sessions
        scope = CodingSession
          .joins(:repo)
          .where(repos: { organization_id: @org.id })
          .where(pushed_by: current_user.github_username)

        render_sessions(scope)
      end

      def metrics
        pr_scope = PrMetrics
          .joins(pr: :repo)
          .where(repos: { organization_id: @org.id })
          .where(prs: { author: current_user.github_username })
          .where(metrics_finalized: true)

        session_scope = CodingSession
          .joins(:repo)
          .where(repos: { organization_id: @org.id })
          .where(pushed_by: current_user.github_username)

        session_scope = apply_agent_type_filter(session_scope)

        render json: MetricsAggregator.new(pr_scope, session_scope: session_scope, window_days: parsed_range, agent_type: parsed_agent_type).call
      end

      def metric_detail
        pr_scope = PrMetrics
          .joins(pr: :repo)
          .where(repos: { organization_id: @org.id })
          .where(prs: { author: current_user.github_username })
          .where(metrics_finalized: true)

        session_scope = CodingSession
          .joins(:repo)
          .where(repos: { organization_id: @org.id })
          .where(pushed_by: current_user.github_username)

        render_metric_detail(pr_scope: pr_scope, session_scope: apply_agent_type_filter(session_scope))
      end
    end
  end
end
