module Api
  module V1
    class MeController < BaseController
      include PrSerialization

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

      def metrics
        scope = PrMetrics
          .joins(pr: :repo)
          .where(repos: { organization_id: @org.id })
          .where(prs: { author: current_user.github_username })
          .where(metrics_finalized: true)

        render json: MetricsAggregator.new(scope, window_days: parsed_range).call
      end
    end
  end
end
