module GitlabApp
  class BackfillConnectionJob < ApplicationJob
    queue_as :default

    retry_on GitlabApp::Client::RateLimitError, wait: :polynomially_longer, attempts: 8
    retry_on GitlabApp::Client::Error, wait: :polynomially_longer, attempts: 3

    def perform(connection_id)
      connection = GitlabConnection.find(connection_id)
      return unless connection.active?

      client = GitlabApp::Client.new(connection)
      webhook_setup = GitlabApp::WebhookSetup.new(connection)

      page = 1
      loop do
        projects = client.list_projects(page: page, per_page: 100)
        break if projects.empty?

        projects.each do |project|
          repo = upsert_repo(connection, project)
          webhook_setup.setup_for_repo(repo)
          BackfillGitlabRepoJob.perform_later(repo.id)
        end

        page += 1
      end

      connection.update!(last_synced_at: Time.current)
    end

    private

    def upsert_repo(connection, project)
      # GitLab project path_with_namespace is "namespace/project"
      namespace = project[:namespace]&.dig(:full_path) || project[:path_with_namespace]&.split("/")&.first
      name = project[:path]

      repo = Repo.find_or_initialize_by(
        organization_id: connection.organization_id,
        platform: "gitlab",
        platform_owner: namespace,
        platform_repo: name
      )
      repo.gitlab_connection = connection
      repo.gitlab_project_id = project[:id]
      repo.path ||= "#{namespace}/#{name}"
      repo.save!
      repo
    end
  end
end
