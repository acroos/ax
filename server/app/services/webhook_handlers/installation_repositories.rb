module WebhookHandlers
  class InstallationRepositories < InstallationBase
    def call
      installation = find_installation
      return unless installation

      handle_added(installation)
      handle_removed(installation)

      installation
    end

    private

    def handle_added(installation)
      repos_added = @payload[:repositories_added] || []

      repos_added.each do |repo_data|
        full_name = repo_data[:full_name]
        owner, name = full_name.split("/", 2)

        repo = Repo.find_or_initialize_by(
          organization_id: installation.organization_id,
          platform_owner: owner,
          platform_repo: name
        )
        repo.github_installation = installation
        repo.path ||= full_name
        repo.save!

        BackfillRepoJob.perform_later(repo.id)
      end
    end

    def handle_removed(installation)
      repos_removed = @payload[:repositories_removed] || []

      repos_removed.each do |repo_data|
        full_name = repo_data[:full_name]
        owner, name = full_name.split("/", 2)

        repo = Repo.find_by(organization_id: installation.organization_id, platform_owner: owner, platform_repo: name)
        next unless repo

        repo.update!(github_installation_id: nil)
      end
    end
  end
end
