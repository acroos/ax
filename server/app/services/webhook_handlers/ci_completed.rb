module WebhookHandlers
  class CiCompleted < Base
    def initialize(check_suite_data, repo_data, installation: nil)
      @check_suite_data = check_suite_data
      @repo_data = repo_data
      @installation = installation
    end

    def call
      repo = find_repo(@repo_data)
      return unless repo

      # check_suite includes pull_requests array
      prs = @check_suite_data[:pull_requests] || []
      conclusion = @check_suite_data[:conclusion]
      ci_rate = conclusion == "success" ? 1.0 : 0.0

      prs.each do |pr_ref|
        pr = Pr.find_by(repo: repo, number: pr_ref[:number])
        next unless pr
        next if pr_finalized?(pr)

        metrics = ensure_pr_metrics(pr)
        metrics.update!(ci_success_rate: ci_rate)
      end
    end
  end
end
