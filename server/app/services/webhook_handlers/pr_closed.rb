module WebhookHandlers
  class PrClosed < Base
    def initialize(pr_data, repo_data, installation: nil)
      @pr_data = pr_data
      @repo_data = repo_data
      @installation = installation
    end

    def call
      repo = find_repo(@repo_data)
      return unless repo

      pr = find_or_create_pr(repo, @pr_data)
      pr.update!(state: "closed", closed_at: @pr_data[:closed_at])
      return if pr_finalized?(pr)

      # Lock early to prevent redundant GitHub API calls from concurrent webhooks.
      # The first thread to acquire the lock fetches and finalizes; the second
      # sees metrics.finalized? and returns immediately.
      metrics = ensure_pr_metrics(pr)
      metrics.with_lock do
        return if metrics.finalized?

        GithubDataFetcher.new(pr).call
        computed = MetricsComputer.new(pr).call

        attrs = computed.compact
        attrs[:metrics_finalized] = true
        attrs[:finalized_at] = metrics.finalized_at || Time.current
        metrics.update!(attrs)
      end
    rescue => e
      Rails.logger.error("[finalization] Failed for PR ##{pr.number}: #{e.class}: #{e.message}")
    end
  end
end
