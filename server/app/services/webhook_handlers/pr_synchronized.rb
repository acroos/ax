module WebhookHandlers
  class PrSynchronized < Base
    def initialize(pr_data, repo_data)
      @pr_data = pr_data
      @repo_data = repo_data
    end

    def call
      repo = find_repo(@repo_data)
      return unless repo

      pr = find_pr(repo, @pr_data)
      return unless pr
      return if pr_finalized?(pr)

      current_commits = @pr_data[:commits] || 0
      open_count = pr.open_commit_count || 0
      post_open = [ current_commits - open_count, 0 ].max

      metrics = ensure_pr_metrics(pr)
      metrics.update!(post_open_commits: post_open)
    end
  end
end
