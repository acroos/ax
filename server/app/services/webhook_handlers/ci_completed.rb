module WebhookHandlers
  class CiCompleted < Base
    def initialize(check_suite_data, repo_data, installation: nil)
      @check_suite_data = check_suite_data
      @repo_data = repo_data
      @installation = installation
    end

    def call
      head_sha = @check_suite_data[:head_sha]
      conclusion = @check_suite_data[:conclusion]
      return unless head_sha && conclusion

      commit = Commit.find_by(sha: head_sha)
      unless commit
        Rails.logger.info("[ci_completed] Commit #{head_sha} not found — will be picked up by backfill")
        return
      end

      # Update per-commit CI status. Failure is sticky: once false,
      # a success from another check suite won't flip it back.
      if conclusion != "success"
        commit.update!(ci_passed: false)
      elsif commit.ci_passed.nil?
        commit.update!(ci_passed: true)
      end

      # Recompute ci_success_rate for the commit's PR.
      # Use the commit's PR association rather than the webhook payload's
      # pull_requests array, which GitHub often leaves empty for merged PRs.
      # update_column bypasses the finalization guard so late-arriving
      # webhooks still update settled PRs.
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
