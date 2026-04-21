module WebhookHandlers
  class Base
    private

    def find_repo(repo_data)
      owner = repo_data[:owner][:login]
      name = repo_data[:name]

      if @installation
        # Prefer repos scoped to this installation's org
        repo = Repo.find_by(github_owner: owner, github_repo: name, organization: @installation.organization)
        return repo if repo
      end

      Repo.find_by(github_owner: owner, github_repo: name)
    end

    def find_pr(repo, pr_data)
      return nil unless repo
      Pr.find_by(repo: repo, number: pr_data[:number])
    end

    def find_or_create_pr(repo, pr_data)
      return nil unless repo
      pr = Pr.find_or_initialize_by(repo: repo, number: pr_data[:number])
      pr.update!(
        title: pr_data[:title],
        branch: pr_data.dig(:head, :ref),
        state: pr_data[:state],
        created_at_source: pr_data[:created_at],
        merged_at: pr_data[:merged_at],
        closed_at: pr_data[:closed_at],
        url: pr_data[:html_url],
        additions: pr_data[:additions] || 0,
        deletions: pr_data[:deletions] || 0,
        changed_files: pr_data[:changed_files] || 0,
        author: pr_data.dig(:user, :login)
      )
      pr
    end

    def pr_finalized?(pr)
      return false unless pr
      pr.pr_metrics&.finalized?
    end

    def ensure_pr_metrics(pr)
      PrMetrics.find_or_create_by!(pr: pr)
    end

    # Session-level advisory lock keyed on PR ID. Prevents concurrent finalization
    # without holding a transaction open (avoiding deadlocks with PushService).
    # Namespace 1 distinguishes finalization locks from any future advisory lock usage.
    def with_finalization_lock(pr)
      conn = ActiveRecord::Base.connection
      conn.execute("SELECT pg_advisory_lock(1, #{pr.id.to_i})")
      yield
    ensure
      conn.execute("SELECT pg_advisory_unlock(1, #{pr.id.to_i})")
    end
  end
end
