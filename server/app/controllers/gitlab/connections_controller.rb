module Gitlab
  class ConnectionsController < ApplicationController
    # GET /gitlab/connections/callback?code=...&state=...
    #
    # GitLab redirects the admin here after they approve the OAuth consent screen.
    # The signed state token (issued moments earlier by the API controller) is
    # the authorization proof — no session auth required.
    def callback
      decoded = GitlabApp::StateToken.verify(params[:state])
      org = Organization.find_by!(slug: decoded[:org])
      connector = User.find(decoded[:user])

      return redirect_with_error(org, "missing_code") unless params[:code].present?

      token_data = exchange_code(params[:code])
      return redirect_with_error(org, "token_exchange_failed") unless token_data

      connection = GitlabConnection.find_or_initialize_by(organization: org)
      connection.assign_attributes(
        gitlab_user_id: fetch_gitlab_user_id(token_data["access_token"]),
        account_username: fetch_gitlab_username(token_data["access_token"]),
        access_token_ciphertext: token_data["access_token"],
        refresh_token_ciphertext: token_data["refresh_token"],
        token_expires_at: Time.current + token_data["expires_in"].to_i.seconds,
        token_scopes: token_data["scope"],
        webhook_secret: connection.webhook_secret || SecureRandom.hex(20),
        connected_by: connector,
        connected_at: connection.connected_at || Time.current,
        status: "active"
      )
      connection.save!

      GitlabApp::BackfillConnectionJob.perform_later(connection.id)

      redirect_to dashboard_url("/#{org.slug}/settings?gitlab_connected=true"), allow_other_host: true
    rescue ActiveSupport::MessageVerifier::InvalidSignature, ActiveRecord::RecordNotFound
      redirect_to dashboard_url("/login?error=invalid_state"), allow_other_host: true
    end

    private

    def exchange_code(code)
      uri = URI("https://gitlab.com/oauth/token")
      response = Net::HTTP.post_form(uri, {
        client_id: ENV["GITLAB_CLIENT_ID"],
        client_secret: ENV["GITLAB_CLIENT_SECRET"],
        code: code,
        grant_type: "authorization_code",
        redirect_uri: callback_url
      })

      return nil unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    rescue JSON::ParserError, Net::OpenTimeout, Net::ReadTimeout => e
      Rails.logger.error("[gitlab-oauth] Token exchange failed: #{e.class}: #{e.message}")
      nil
    end

    def fetch_gitlab_user_id(access_token)
      fetch_gitlab_user(access_token)&.dig(:id)
    end

    def fetch_gitlab_username(access_token)
      fetch_gitlab_user(access_token)&.dig(:username) || "unknown"
    end

    def fetch_gitlab_user(access_token)
      return @gitlab_user if defined?(@gitlab_user)

      uri = URI("https://gitlab.com/api/v4/user")
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{access_token}"

      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
        http.request(request)
      end

      @gitlab_user = response.is_a?(Net::HTTPSuccess) ? JSON.parse(response.body, symbolize_names: true) : nil
    rescue => e
      Rails.logger.error("[gitlab-oauth] Failed to fetch user info: #{e.class}: #{e.message}")
      @gitlab_user = nil
    end

    def callback_url
      base = ENV.fetch("API_BASE_URL", "https://ax.up.railway.app").chomp("/")
      "#{base}/gitlab/connections/callback"
    end

    def redirect_with_error(org, code)
      redirect_to dashboard_url("/#{org.slug}/settings?gitlab_connected=false&error=#{code}"), allow_other_host: true
    end

    def dashboard_url(path = "/")
      base = ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
      "#{base}#{path}"
    end
  end
end
