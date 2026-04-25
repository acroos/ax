module WebhookHandlers
  module Gitlab
    class PipelineCompleted < WebhookHandlers::Base
      # GitLab pipeline statuses → ci_passed boolean:
      # "success" → true
      # "failed" → false
      # "canceled", "skipped" → nil (ignore)
      # "pending", "running", "created" → nil (not yet complete)
      TERMINAL_STATUSES = { "success" => true, "failed" => false }.freeze

      def initialize(payload, repo)
        @payload = payload
        @repo = repo
      end

      def call
        pipeline = @payload[:object_attributes]
        return unless pipeline

        status = pipeline[:status]
        ci_passed = TERMINAL_STATUSES[status]
        return if ci_passed.nil?

        sha = pipeline[:sha]
        return unless sha

        commit = Commit.find_by(sha: sha)
        unless commit
          Rails.logger.info("[gitlab-pipeline] Commit #{sha} not found — will be picked up by backfill")
          return
        end

        # Failure is sticky: once false, a success won't flip it back
        if ci_passed == false
          commit.update!(ci_passed: false)
        elsif commit.ci_passed.nil?
          commit.update!(ci_passed: true)
        end

        recompute_ci_rate(commit.pr) if commit.pr
      end

      private

      def recompute_ci_rate(pr)
        commits_with_ci = pr.commits.where.not(ci_passed: nil)
        return unless commits_with_ci.exists?

        rate = commits_with_ci.where(ci_passed: true).count.to_f / commits_with_ci.count
        metrics = ensure_pr_metrics(pr)
        metrics.update_column(:ci_success_rate, rate)
      end
    end
  end
end
