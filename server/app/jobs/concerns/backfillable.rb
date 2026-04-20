module Backfillable
  extend ActiveSupport::Concern

  private

  def backfill_pr(pr_data, repo_data)
    # Always run PrOpened to upsert the PR record
    WebhookHandlers::PrOpened.new(pr_data, repo_data).call

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
end
