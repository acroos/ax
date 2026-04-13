module WebhookHandlers
  class InstallationCreated < InstallationBase
    def call
      installation = GithubInstallation.find_or_initialize_by(
        github_installation_id: @installation_data[:id]
      )

      installation.assign_attributes(
        account_login: @installation_data.dig(:account, :login),
        account_type: @installation_data.dig(:account, :type),
        target_type: @installation_data[:target_type],
        repository_selection: @installation_data[:repository_selection],
        permissions: @installation_data[:permissions]&.to_h || {},
        events: @installation_data[:events] || [],
        installed_at: installation.installed_at || Time.current,
        status: :active
      )

      # The setup-URL callback has the authoritative org mapping via signed
      # state token. If it already created this row, don't overwrite org.
      # If the webhook arrived first, org stays nil until the callback fills it.
      installation.save!
      installation
    end
  end
end
