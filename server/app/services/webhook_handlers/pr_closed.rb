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

      # Phase 1: Fetch from GitHub (network I/O, no transaction).
      # PrFile/Commit writes here are idempotent — safe outside a transaction.
      GithubDataFetcher.new(pr).call

      # Phase 2: Compute metrics (reads from DB, no writes).
      computed = MetricsComputer.new(pr).call

      # Phase 3: Write metrics + finalize (DB-only transaction, single update).
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
    rescue => e
      Rails.logger.error("[finalization] Failed for PR ##{pr.number}: #{e.class}: #{e.message}")
    end
  end
end
