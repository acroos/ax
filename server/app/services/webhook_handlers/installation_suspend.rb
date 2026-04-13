module WebhookHandlers
  class InstallationSuspend < InstallationBase
    def call
      installation = find_installation
      return unless installation

      installation.update!(status: :suspended)
      installation
    end
  end
end
