module Api
  module V1
    class GithubInstallationsController < BaseController
      before_action :require_session_auth!
      before_action :find_org!, only: :show
      before_action :find_org_as_admin!, only: :install_url

      # GET /api/v1/orgs/:org_slug/github_installation
      # Returns the current installation state for the settings page.
      def show
        installation = @org.github_installations.where.not(status: "deleted").order(created_at: :desc).first
        user_role = current_user.role_in(@org)

        if installation
          render json: {
            installation: {
              id: installation.id,
              github_installation_id: installation.github_installation_id,
              account_login: installation.account_login,
              account_type: installation.account_type,
              repository_selection: installation.repository_selection,
              status: installation.status,
              installed_at: installation.installed_at,
              last_synced_at: installation.last_synced_at,
              repos_count: installation.repos.count
            },
            user_role: user_role
          }
        else
          render json: { installation: nil, user_role: user_role }
        end
      end

      # POST /api/v1/orgs/:org_slug/github_installation/install_url
      # Returns a signed GitHub App install URL. Admin-only.
      def install_url
        app_slug = ENV["GITHUB_APP_SLUG"]
        unless app_slug.present?
          return render json: { error: "GitHub App not configured" }, status: :service_unavailable
        end

        state = GithubApp::StateToken.generate(
          org_slug: @org.slug,
          user_id: current_user.id
        )

        install_url = "https://github.com/apps/#{app_slug}/installations/new?state=#{CGI.escape(state)}"
        render json: { install_url: install_url }
      end
    end
  end
end
