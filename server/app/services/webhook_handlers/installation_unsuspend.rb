module WebhookHandlers
  class InstallationUnsuspend < InstallationBase
    def call
      installation = find_installation
      return unless installation

      installation.update!(status: :active)
      installation
    end
  end
end
