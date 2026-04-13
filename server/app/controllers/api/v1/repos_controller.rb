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
        finalized_metrics = PrMetrics
          .joins(:pr)
          .where(prs: { repo_id: @repo.id }, metrics_finalized: true)

        total = finalized_metrics.count
        return render json: { totalPRs: 0 } if total == 0

        aggregated = finalized_metrics.pick(
          Arel.sql("AVG(post_open_commits)"),
          Arel.sql("AVG(CASE WHEN first_pass_accepted THEN 1.0 ELSE 0.0 END)"),
          Arel.sql("AVG(ci_success_rate)"),
          Arel.sql("AVG(CASE WHEN has_tests THEN 1.0 ELSE 0.0 END)"),
          Arel.sql("AVG(messages_per_pr)"),
          Arel.sql("AVG(iteration_depth)"),
          Arel.sql("AVG(token_cost_usd)"),
          Arel.sql("SUM(token_cost_usd)"),
          Arel.sql("AVG(self_correction_rate)"),
          Arel.sql("AVG(context_efficiency)"),
          Arel.sql("AVG(diff_churn_lines)"),
          Arel.sql("AVG(line_revisit_rate)"),
          Arel.sql("AVG(error_recovery_attempts)"),
          Arel.sql("AVG(plan_coverage_score)"),
          Arel.sql("AVG(plan_deviation_score)"),
          Arel.sql("AVG(CASE WHEN scope_creep_detected THEN 1.0 ELSE 0.0 END)"),
          Arel.sql("COUNT(CASE WHEN plan_coverage_score IS NOT NULL THEN 1 END)")
        )

        repo_met = ::RepoMetrics.where(repo: @repo).order(computed_at: :desc).first

        render json: {
          totalPRs: total,
          avgPostOpenCommits: aggregated[0]&.to_f,
          firstPassAcceptanceRate: aggregated[1]&.to_f,
          ciSuccessRate: aggregated[2]&.to_f,
          testCoverageRate: aggregated[3]&.to_f,
          avgMessagesPerPR: aggregated[4]&.to_f,
          avgIterationDepth: aggregated[5]&.to_f,
          avgTokenCost: aggregated[6]&.to_f,
          totalTokenCost: aggregated[7]&.to_f,
          avgSelfCorrectionRate: aggregated[8]&.to_f,
          avgContextEfficiency: aggregated[9]&.to_f,
          avgDiffChurnLines: aggregated[10]&.to_f,
          avgLineRevisitRate: aggregated[11]&.to_f,
          avgErrorRecoveryAttempts: aggregated[12]&.to_f,
          avgPlanCoverage: aggregated[13]&.to_f,
          avgPlanDeviation: aggregated[14]&.to_f,
          scopeCreepRate: aggregated[15]&.to_f,
          planDataCount: aggregated[16].to_i,
          unmergedCostUSD: repo_met&.unmerged_cost_usd,
          totalCostUSD: repo_met&.total_cost_usd,
          unmergedRate: repo_met&.unmerged_rate
        }
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
            messages_per_pr: m&.messages_per_pr,
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
          metrics: m ? {
            pr_number: pr.number,
            messages_per_pr: m.messages_per_pr,
            iteration_depth: m.iteration_depth,
            post_open_commits: m.post_open_commits,
            first_pass_accepted: m.first_pass_accepted,
            ci_success_rate: m.ci_success_rate,
            diff_churn_lines: m.diff_churn_lines,
            has_tests: m.has_tests,
            line_revisit_rate: m.line_revisit_rate,
            self_correction_rate: m.self_correction_rate,
            context_efficiency: m.context_efficiency,
            error_recovery_attempts: m.error_recovery_attempts,
            token_cost_usd: m.token_cost_usd,
            plan_coverage_score: m.plan_coverage_score,
            plan_deviation_score: m.plan_deviation_score,
            scope_creep_detected: m.scope_creep_detected,
            metrics_finalized: m.metrics_finalized,
            finalized_at: m.finalized_at
          } : nil
        }
      end
    end
  end
end
