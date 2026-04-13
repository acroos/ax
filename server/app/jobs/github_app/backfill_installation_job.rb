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

      client.list_repositories.each do |gh_repo|
        repo = upsert_repo(installation, gh_repo)
        BackfillRepoJob.perform_later(repo.id)
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
  end
end
