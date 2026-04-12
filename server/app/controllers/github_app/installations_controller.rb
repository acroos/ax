module GithubApp
  class InstallationsController < ApplicationController
    # GET /github/installations/callback?installation_id=N&setup_action=install&state=...
    #
    # GitHub redirects the admin here after they complete the App install flow.
    # No session auth required — the signed state token (issued moments earlier
    # by the API controller) is the authorization proof.
    def callback
      decoded = GithubApp::StateToken.verify(params[:state])
      org = Organization.find_by!(slug: decoded[:org])
      installer = User.find(decoded[:user])

      installation_id = params[:installation_id]&.to_i
      return redirect_with_error(org, "missing_installation_id") unless installation_id&.positive?

      remote = fetch_installation_details(installation_id)
      return redirect_with_error(org, "github_api_error") unless remote

      installation = GithubInstallation.find_or_initialize_by(
        github_installation_id: installation_id
      )

      installation.assign_attributes(
        organization: org,
        account_login: remote[:account][:login],
        account_type: remote[:account][:type],
        target_type: remote[:target_type],
        repository_selection: remote[:repository_selection],
        permissions: remote[:permissions].to_h,
        events: remote[:events] || [],
        installed_by: installer,
        installed_at: installation.installed_at || Time.current,
        status: "active"
      )
      installation.save!

      redirect_to dashboard_url("/#{org.slug}/settings?installed=true"), allow_other_host: true
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      redirect_to dashboard_url("/login?error=invalid_state"), allow_other_host: true
    rescue ActiveRecord::RecordNotFound
      redirect_to dashboard_url("/login?error=invalid_state"), allow_other_host: true
    end

    private

    def fetch_installation_details(installation_id)
      jwt = GithubApp::JwtGenerator.generate
      Octokit::Client.new(bearer_token: jwt).get("/app/installations/#{installation_id}")
    rescue Octokit::Error => e
      Rails.logger.error("[github-app] Failed to fetch installation #{installation_id}: #{e.class}: #{e.message}")
      nil
    end

    def redirect_with_error(org, code)
      redirect_to dashboard_url("/#{org.slug}/settings?installed=false&error=#{code}"), allow_other_host: true
    end

    def dashboard_url(path = "/")
      base = ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
      "#{base}#{path}"
    end
  end
end
