module WebhookHandlers
  class PrOpened < Base
    def initialize(pr_data, repo_data, installation: nil)
      @pr_data = pr_data
      @repo_data = repo_data
      @installation = installation
    end

    def call
      repo = find_repo(@repo_data)
      return unless repo

      pr = find_or_create_pr(repo, @pr_data)
      pr.update!(
        state: "open",
        open_commit_count: @pr_data[:commits]
      )

      metrics = ensure_pr_metrics(pr)
      metrics.update!(post_open_commits: 0) unless metrics.finalized?

      # Correlate this PR's branch with existing sessions
      SessionPrCorrelationService.new(repo).call
    end
  end
end
