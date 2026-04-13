module WebhookHandlers
  class InstallationDeleted < InstallationBase
    def call
      installation = find_installation
      return unless installation

      ActiveRecord::Base.transaction do
        installation.update!(status: :deleted)
        installation.repos.update_all(github_installation_id: nil)
      end

      installation
    end
  end
end
