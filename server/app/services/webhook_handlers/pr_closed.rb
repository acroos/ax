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

      # Advisory lock prevents redundant GitHub API calls from concurrent webhooks
      # without holding a transaction open during network I/O (which would risk
      # deadlocks with PushService writing to the same commits/prs rows).
      with_finalization_lock(pr) do
        return if pr_finalized?(pr)

        GithubDataFetcher.new(pr).call
        computed = MetricsComputer.new(pr).call

        ActiveRecord::Base.transaction do
          metrics = ensure_pr_metrics(pr)
          metrics.with_lock do
            return if metrics.finalized?

            attrs = computed.compact
            attrs[:metrics_finalized] = true
            attrs[:finalized_at] = metrics.finalized_at || Time.current
            metrics.update!(attrs)
          end
        end
      end
    rescue => e
      Rails.logger.error("[finalization] Failed for PR ##{pr.number}: #{e.class}: #{e.message}")
    end
  end
end
