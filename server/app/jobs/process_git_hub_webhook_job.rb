class ProcessGitHubWebhookJob < ApplicationJob
  queue_as :webhooks

  def perform(event_type, payload_json, delivery_id = nil)
    # Deduplicate using X-GitHub-Delivery header (same pattern as Stripe).
    # Default nil preserves backward compatibility for jobs enqueued before deploy.
    if delivery_id
      return if ProcessedGithubEvent.insert({ event_id: delivery_id }, unique_by: :event_id).rows.empty?
    end

    payload = JSON.parse(payload_json, symbolize_names: true)

    case event_type
    when "pull_request"
      handle_pull_request(payload)
    when "check_suite"
      handle_check_suite(payload)
    when "installation"
      handle_installation(payload)
    when "installation_repositories"
      handle_installation_repositories(payload)
    end
  end

  private

  def resolve_installation(payload)
    github_id = payload.dig(:installation, :id)
    return nil unless github_id

    installation = GithubInstallation.find_by(github_installation_id: github_id)

    unless installation
      Rails.logger.warn("Webhook from unknown installation #{github_id} — skipping")
      return :unknown
    end

    unless installation.active?
      Rails.logger.warn("Webhook from #{installation.status} installation #{github_id} — skipping")
      return :inactive
    end

    installation
  end

  def handle_pull_request(payload)
    installation = resolve_installation(payload)
    return if installation == :unknown || installation == :inactive

    action = payload[:action]
    pr_data = payload[:pull_request]
    repo_data = payload[:repository]

    case action
    when "opened"
      WebhookHandlers::PrOpened.new(pr_data, repo_data, installation: installation).call
    when "synchronize"
      WebhookHandlers::PrSynchronized.new(pr_data, repo_data, installation: installation).call
    when "closed"
      if pr_data[:merged]
        WebhookHandlers::PrMerged.new(pr_data, repo_data, installation: installation).call
      else
        WebhookHandlers::PrClosed.new(pr_data, repo_data, installation: installation).call
      end
    end
  end

  def handle_check_suite(payload)
    return unless payload[:action] == "completed"

    installation = resolve_installation(payload)
    return if installation == :unknown || installation == :inactive

    WebhookHandlers::CiCompleted.new(
      payload[:check_suite],
      payload[:repository],
      installation: installation
    ).call
  end

  def handle_installation(payload)
    case payload[:action]
    when "created"
      WebhookHandlers::InstallationCreated.new(payload).call
    when "deleted"
      WebhookHandlers::InstallationDeleted.new(payload).call
    when "suspend"
      WebhookHandlers::InstallationSuspend.new(payload).call
    when "unsuspend"
      WebhookHandlers::InstallationUnsuspend.new(payload).call
    end
  end

  def handle_installation_repositories(payload)
    WebhookHandlers::InstallationRepositories.new(payload).call
  end
end
