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

      metrics = ensure_pr_metrics(pr)

      # Capture review cycle time on first human review (exclude bots)
      capture_review_cycle_time(pr, metrics) if should_capture_review_time?
    end

    private

    def should_capture_review_time?
      # Only capture if this is the first review and it's from a human (not a bot)
      reviewer_type = @review_data.dig(:user, :type)
      reviewer_type == "User"
    end

    def capture_review_cycle_time(pr, metrics)
      # Only capture on first review
      return if metrics.first_review_at.present?

      pr_opened_at = Time.parse(pr.created_at_source)
      review_submitted_at = Time.parse(@review_data[:submitted_at])
      cycle_time_minutes = ((review_submitted_at - pr_opened_at) / 60).round

      metrics.update!(
        first_review_at: review_submitted_at,
        review_cycle_time_minutes: cycle_time_minutes
      )
    end
  end
end
