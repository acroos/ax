module WebhookHandlers
  class ReviewSubmitted < Base
    def initialize(review_data, pr_data, repo_data, installation: nil)
      @review_data = review_data
      @pr_data = pr_data
      @repo_data = repo_data
      @installation = installation
    end

    def call
      repo = find_repo(@repo_data)
      return unless repo

      pr = find_pr(repo, @pr_data)
      return unless pr
      return if pr_finalized?(pr)

      state = @review_data[:state]
      metrics = ensure_pr_metrics(pr)

      case state
      when "CHANGES_REQUESTED", "changes_requested"
        metrics.update!(first_pass_accepted: false)
      when "APPROVED", "approved"
        # Latch: only set to true if not already set to false
        if metrics.first_pass_accepted.nil?
          metrics.update!(first_pass_accepted: true)
        end
      end
    end
  end
end
