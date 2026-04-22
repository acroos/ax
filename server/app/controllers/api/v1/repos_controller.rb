module Api
  module V1
    class ReposController < BaseController
      include PrSerialization
      include SessionSerialization
      include MetricDetailAction

      before_action :require_session_auth!
      before_action :find_org!, only: [ :index, :prs, :sessions, :metrics, :metric_detail, :timeline ]
      before_action :find_repo!, only: [ :prs, :sessions, :metrics, :metric_detail, :timeline ]

      def index
        repos = @org.repos.select(
          :id, :path, :github_owner, :github_repo, :last_synced_at
        )
        render json: repos
      end

      def prs
        scope = @repo.prs
          .left_joins(:pr_metrics)
          .includes(:pr_metrics, :session_prs)
          .order(created_at: :desc, id: :desc)

        render_paginated_prs(scope)
      end

      def sessions
        scope = CodingSession.where(repo_id: @repo.id)
        render_sessions(scope)
      end

      def metrics
        pr_scope = PrMetrics
          .joins(:pr)
          .where(prs: { repo_id: @repo.id }, metrics_finalized: true)

        session_scope = CodingSession
          .where(repo_id: @repo.id)

        render json: MetricsAggregator.new(pr_scope, session_scope: session_scope, window_days: parsed_range).call
      end

      def metric_detail
        pr_scope = PrMetrics
          .joins(:pr)
          .where(prs: { repo_id: @repo.id }, metrics_finalized: true)

        session_scope = CodingSession
          .where(repo_id: @repo.id)

        render_metric_detail(pr_scope: pr_scope, session_scope: session_scope)
      end

      def timeline
        prs = @repo.prs
          .joins(:pr_metrics)
          .where(pr_metrics: { metrics_finalized: true })
          .includes(:pr_metrics)
          .order(:created_at_source)

        render json: prs.map { |pr|
          m = pr.pr_metrics
          {
            pr_number: pr.number,
            title: pr.title,
            created_at: pr.created_at_source,
            post_open_commits: m&.post_open_commits,
            ci_success_rate: m&.ci_success_rate.nil? ? nil : (m.ci_success_rate * 100),
            token_cost_usd: m&.token_cost_usd
          }
        }
      end

      private

      def find_repo!
        @repo = @org.repos.find(params[:id])
      end
    end
  end
end
