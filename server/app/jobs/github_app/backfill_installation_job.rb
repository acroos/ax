module GithubApp
  class BackfillInstallationJob < ApplicationJob
    queue_as :default

    # Respect GitHub's Retry-After header when we hit rate limits.
    # Falls back to polynomial backoff if the header is missing.
    retry_on Octokit::TooManyRequests, wait: :polynomially_longer, attempts: 8
    retry_on Octokit::ServerError, wait: :polynomially_longer, attempts: 3

    def perform(installation_id)
      installation = GithubInstallation.find(installation_id)
      return unless installation.active?

      client = GithubApp::Client.new(installation)
      since = ENV.fetch("GITHUB_APP_BACKFILL_DAYS", "90").to_i.days.ago

      client.list_repositories.each do |gh_repo|
        repo = upsert_repo(installation, gh_repo)
        backfill_repo(client, repo, since)
      end

      installation.update!(last_synced_at: Time.current)
    end

    private

    def upsert_repo(installation, gh_repo)
      owner = gh_repo[:owner][:login]
      name = gh_repo[:name]

      repo = Repo.find_or_initialize_by(github_owner: owner, github_repo: name)
      repo.organization = installation.organization
      repo.github_installation = installation
      repo.path ||= "#{owner}/#{name}"
      repo.save!
      repo
    end

    def backfill_repo(client, repo, since)
      pulls = client.list_pulls(
        owner: repo.github_owner,
        repo: repo.github_repo,
        state: "all",
        since: since
      )

      repo_data = { owner: { login: repo.github_owner }, name: repo.github_repo }

      pulls.each do |pr_data|
        backfill_pr(pr_data, repo_data)
      end
    end

    def backfill_pr(pr_data, repo_data)
      # Always run PrOpened to upsert the PR record
      WebhookHandlers::PrOpened.new(pr_data, repo_data).call

      if pr_data[:merged_at]
        WebhookHandlers::PrMerged.new(pr_data, repo_data).call
      elsif pr_data[:closed_at]
        WebhookHandlers::PrClosed.new(pr_data, repo_data).call
      end
    rescue => e
      Rails.logger.error(
        "[github-app] Backfill failed for PR ##{pr_data[:number]} " \
        "in #{repo_data[:owner][:login]}/#{repo_data[:name]}: #{e.class}: #{e.message}"
      )
    end
  end
end
