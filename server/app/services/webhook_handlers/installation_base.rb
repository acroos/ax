module WebhookHandlers
  class InstallationBase
    def initialize(payload)
      @payload = payload
      @installation_data = payload[:installation]
    end

    private

    def find_installation
      GithubInstallation.find_by(
        github_installation_id: @installation_data[:id]
      )
    end
  end
end
