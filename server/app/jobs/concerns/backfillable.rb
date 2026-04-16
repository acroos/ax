module Backfillable
  extend ActiveSupport::Concern

  private

  def backfill_pr(pr_data, repo_data)
    # Always run PrOpened to upsert the PR record
    WebhookHandlers::PrOpened.new(pr_data, repo_data).call

    # Backfill reviews so review cycle time is captured before finalization
    backfill_reviews(pr_data, repo_data)

    # PrMerged/PrClosed fetch file data, compute metrics, and finalize
    if pr_data[:merged_at]
      WebhookHandlers::PrMerged.new(pr_data, repo_data).call
    elsif pr_data[:closed_at]
      WebhookHandlers::PrClosed.new(pr_data, repo_data).call
    end
  rescue => e
    Rails.logger.error(
      "[backfill] Failed for PR ##{pr_data[:number]} " \
      "in #{repo_data[:owner][:login]}/#{repo_data[:name]}: #{e.class}: #{e.message}"
    )
  end

  def backfill_reviews(pr_data, repo_data)
    owner = repo_data[:owner][:login]
    name = repo_data[:name]
    repo = Repo.find_by(github_owner: owner, github_repo: name)
    return unless repo

    pr = Pr.find_by(repo: repo, number: pr_data[:number])
    return unless pr
    return if pr.pr_metrics&.finalized?

    installation = repo.github_installation
    return unless installation

    client = GithubApp::Client.new(installation)
    reviews = client.list_pull_reviews(owner: owner, repo: name, number: pr.number)

    reviews.each do |review|
      WebhookHandlers::ReviewSubmitted.new(
        review, pr_data, repo_data
      ).call
    end
  rescue => e
    Rails.logger.warn("[backfill] Review backfill failed for PR ##{pr_data[:number]}: #{e.message}")
  end
end
