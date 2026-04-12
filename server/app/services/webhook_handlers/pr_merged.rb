module WebhookHandlers
  class PrMerged < Base
    def initialize(pr_data, repo_data)
      @pr_data = pr_data
      @repo_data = repo_data
    end

    def call
      repo = find_repo(@repo_data)
      return unless repo

      pr = find_or_create_pr(repo, @pr_data)
      return if pr_finalized?(pr)

      pr.update!(state: "merged", merged_at: @pr_data[:merged_at])
      fetch_and_compute(pr)
      finalize_metrics(pr)
    end

    private

    def fetch_and_compute(pr)
      GithubDataFetcher.new(pr).call
      computed = MetricsComputer.new(pr).call

      metrics = ensure_pr_metrics(pr)
      metrics.update!(computed.compact)
    rescue => e
      Rails.logger.error("Failed to fetch/compute metrics for PR ##{pr.number}: #{e.message}")
    end

    def finalize_metrics(pr)
      metrics = ensure_pr_metrics(pr)
      metrics.update!(
        metrics_finalized: true,
        finalized_at: Time.current
      )
    end
  end
end
