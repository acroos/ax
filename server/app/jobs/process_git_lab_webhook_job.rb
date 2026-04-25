class ProcessGitLabWebhookJob < ApplicationJob
  queue_as :webhooks

  def perform(payload_json, event_uuid = nil)
    if event_uuid
      return if ProcessedGitlabEvent.insert({ event_id: event_uuid }, unique_by: :event_id).rows.empty?
    end

    payload = JSON.parse(payload_json, symbolize_names: true)
    object_kind = payload[:object_kind]

    case object_kind
    when "merge_request"
      handle_merge_request(payload)
    when "pipeline"
      handle_pipeline(payload)
    end
  end

  private

  def resolve_connection(payload)
    # GitLab webhooks include project.namespace and project.path_with_namespace
    project = payload[:project]
    return nil unless project

    namespace = project[:namespace] || project[:path_with_namespace]&.split("/")&.first
    name = project[:path] || project[:path_with_namespace]&.split("/")&.last

    repo = Repo.find_by(platform: "gitlab", platform_owner: namespace, platform_repo: name)
    return nil unless repo

    connection = repo.gitlab_connection
    return nil unless connection&.active?

    [ repo, connection ]
  end

  def handle_merge_request(payload)
    result = resolve_connection(payload)
    return unless result

    repo, _connection = result
    mr = payload[:object_attributes]
    action = mr[:action]

    case action
    when "open"
      WebhookHandlers::Gitlab::MrOpened.new(mr, repo).call
    when "update"
      WebhookHandlers::Gitlab::MrUpdated.new(mr, repo).call
    when "merge"
      WebhookHandlers::Gitlab::MrMerged.new(mr, repo).call
    when "close"
      WebhookHandlers::Gitlab::MrClosed.new(mr, repo).call
    end
  end

  def handle_pipeline(payload)
    result = resolve_connection(payload)
    return unless result

    repo, _connection = result
    WebhookHandlers::Gitlab::PipelineCompleted.new(payload, repo).call
  end
end
