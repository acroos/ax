class ProcessGitHubWebhookJob < ApplicationJob
  queue_as :webhooks

  def perform(event_type, payload_json)
    payload = JSON.parse(payload_json, symbolize_names: true)

    case event_type
    when "pull_request"
      handle_pull_request(payload)
    when "pull_request_review"
      handle_review(payload)
    when "check_suite"
      handle_check_suite(payload)
    end
  end

  private

  def handle_pull_request(payload)
    action = payload[:action]
    pr_data = payload[:pull_request]
    repo_data = payload[:repository]

    case action
    when "opened"
      WebhookHandlers::PrOpened.new(pr_data, repo_data).call
    when "synchronize"
      WebhookHandlers::PrSynchronized.new(pr_data, repo_data).call
    when "closed"
      if pr_data[:merged]
        WebhookHandlers::PrMerged.new(pr_data, repo_data).call
      else
        WebhookHandlers::PrClosed.new(pr_data, repo_data).call
      end
    end
  end

  def handle_review(payload)
    return unless payload[:action] == "submitted"

    WebhookHandlers::ReviewSubmitted.new(
      payload[:review],
      payload[:pull_request],
      payload[:repository]
    ).call
  end

  def handle_check_suite(payload)
    return unless payload[:action] == "completed"

    WebhookHandlers::CiCompleted.new(
      payload[:check_suite],
      payload[:repository]
    ).call
  end
end
