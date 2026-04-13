class BackfillRepoJob < ApplicationJob
  include Backfillable

  queue_as :default

  retry_on Octokit::TooManyRequests, wait: :polynomially_longer, attempts: 8
  retry_on Octokit::ServerError, wait: :polynomially_longer, attempts: 3

  def perform(repo_id)
    repo = Repo.find(repo_id)
    installation = repo.github_installation
    return unless installation&.active?

    client = GithubApp::Client.new(installation)
    since = ENV.fetch("GITHUB_APP_BACKFILL_DAYS", "90").to_i.days.ago

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

    # Correlate sessions to PRs after backfill
    SessionPrCorrelationService.new(repo).call

    repo.update!(last_synced_at: Time.current)
  end
end
