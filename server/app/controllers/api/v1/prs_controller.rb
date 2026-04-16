module Api
  module V1
    class PrsController < BaseController
      before_action :require_session_auth!

      def show
        pr = Pr
          .joins(repo: :organization)
          .joins(:pr_metrics)
          .includes(:pr_metrics, repo: :organization)
          .where(pr_metrics: { metrics_finalized: true })
          .find(params[:id])

        # Verify the current user has access to this PR's org
        org = pr.repo.organization
        head(:forbidden) and return unless current_user&.member_of?(org)

        @org = org
        cutoff = history_cutoff
        if cutoff && pr.created_at_source.present?
          head(:forbidden) and return if pr.created_at_source < cutoff.iso8601
        end

        render json: pr_with_metrics(pr)
      end

      private

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
          author: pr.author,
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
