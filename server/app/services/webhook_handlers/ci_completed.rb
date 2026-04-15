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
      return unless commit

      # Update per-commit CI status. Failure is sticky: once false,
      # a success from another check suite won't flip it back.
      if conclusion != "success"
        commit.update!(ci_passed: false)
      elsif commit.ci_passed.nil?
        commit.update!(ci_passed: true)
      end

      # Recompute ci_success_rate for each associated PR.
      # Use update_column to bypass the finalization guard —
      # late-arriving webhooks should still update settled PRs.
      prs = @check_suite_data[:pull_requests] || []
      repo = find_repo(@repo_data)
      return unless repo

      prs.each do |pr_ref|
        pr = Pr.find_by(repo: repo, number: pr_ref[:number])
        next unless pr

        recompute_ci_rate(pr)
      end
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
