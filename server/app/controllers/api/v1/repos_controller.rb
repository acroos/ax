module Api
  module V1
    class ReposController < BaseController
      before_action :require_session_auth!
      before_action :find_org!, only: [ :index, :prs, :metrics, :timeline, :repo_metrics ]
      before_action :find_repo!, only: [ :prs, :metrics, :timeline, :repo_metrics ]

      def index
        repos = @org.repos.select(
          :id, :path, :github_owner, :github_repo, :last_synced_at
        )
        render json: repos
      end

      def prs
        prs = @repo.prs
          .left_joins(:pr_metrics)
          .includes(:pr_metrics)

        render json: prs.map { |pr| pr_with_metrics(pr) }
      end

      def metrics
        scope = PrMetrics
          .joins(:pr)
          .where(prs: { repo_id: @repo.id }, metrics_finalized: true)

        result = MetricsAggregator.new(scope).call

        repo_met = ::RepoMetrics.where(repo: @repo).order(computed_at: :desc).first
        result[:unmergedCostUSD] = repo_met&.unmerged_cost_usd
        result[:totalCostUSD]    = repo_met&.total_cost_usd
        result[:unmergedRate]    = repo_met&.unmerged_rate

        render json: result
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

      def repo_metrics
        metrics = ::RepoMetrics.where(repo: @repo).order(computed_at: :desc).first

        render json: {
          unmergedCostUSD: metrics&.unmerged_cost_usd,
          totalCostUSD: metrics&.total_cost_usd,
          unmergedRate: metrics&.unmerged_rate
        }
      end

      private

      def find_repo!
        @repo = @org.repos.find(params[:id])
      end

      def pr_with_metrics(pr)
        m = pr.pr_metrics
        {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          branch: pr.branch,
          state: pr.state,
          created_at: pr.created_at_source,
          merged_at: pr.merged_at,
          closed_at: pr.closed_at,
          url: pr.url,
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changed_files,
          github_owner: pr.repo.github_owner,
          github_repo: pr.repo.github_repo,
          session_count: pr.session_prs.size,
          metrics: m ? {
            pr_number: pr.number,
            iteration_depth: m.iteration_depth,
            post_open_commits: m.post_open_commits,
            ci_success_rate: m.ci_success_rate,
            line_revisit_rate: m.line_revisit_rate,
            token_cost_usd: m.token_cost_usd,
            cache_hit_rate: m.cache_hit_rate,
            sidechain_rate: m.sidechain_rate,
            re_read_rate: m.re_read_rate,
            autonomy_score: m.autonomy_score,
            metrics_finalized: m.metrics_finalized,
            finalized_at: m.finalized_at
          } : nil
        }
      end
    end
  end
end
