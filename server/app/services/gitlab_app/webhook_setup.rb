module GitlabApp
  class WebhookSetup
    def initialize(connection)
      @connection = connection
      @client = GitlabApp::Client.new(connection)
    end

    def setup_for_repo(repo)
      webhook_url = "#{ENV.fetch('API_BASE_URL', 'https://ax.up.railway.app')}/webhooks/gitlab"

      result = @client.create_project_webhook(
        repo.gitlab_project_id,
        url: webhook_url,
        secret: @connection.webhook_secret,
        events: [ :merge_requests, :pipeline ]
      )

      repo.update!(gitlab_webhook_id: result[:id]) if result&.dig(:id)
      result
    rescue GitlabApp::Client::Error => e
      Rails.logger.error("[gitlab-webhook-setup] Failed for repo #{repo.platform_owner}/#{repo.platform_repo}: #{e.message}")
      nil
    end

    def teardown_for_repo(repo)
      return unless repo.gitlab_webhook_id.present?

      @client.delete_project_webhook(repo.gitlab_project_id, repo.gitlab_webhook_id)
      repo.update!(gitlab_webhook_id: nil)
    rescue GitlabApp::Client::Error => e
      Rails.logger.warn("[gitlab-webhook-teardown] Failed for repo #{repo.platform_owner}/#{repo.platform_repo}: #{e.message}")
    end
  end
end
