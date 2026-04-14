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
      # No reviews = accepted on first pass
      metrics.update!(first_pass_accepted: true) if metrics.first_pass_accepted.nil?
      metrics.update!(
        metrics_finalized: true,
        finalized_at: Time.current
      )
    end
  end
end
