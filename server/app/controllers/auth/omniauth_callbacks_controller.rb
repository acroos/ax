module Auth
  class OmniauthCallbacksController < ApplicationController
    def github
      user = AuthService.find_or_create_from_github(auth_hash)
      complete_sign_in(user)
    end

    def gitlab
      user = AuthService.find_or_create_from_gitlab(auth_hash)
      complete_sign_in(user)
    end

    def failure
      error = request.env["omniauth.error"]
      error_type = request.env["omniauth.error.type"]
      strategy = request.env["omniauth.error.strategy"]&.name

      Rails.logger.error(
        "[omniauth] failure strategy=#{strategy} type=#{error_type} " \
        "message=#{params[:message]} error=#{error&.class}: #{error&.message}"
      )

      render json: {
        error: "Authentication failed: #{params[:message] || error_type || error&.message || 'unknown'}"
      }, status: :unauthorized
    end

    private

    def complete_sign_in(user)
      session = UserSession.create_for(user, request)

      # Cross-origin auth handoff: we cannot set a cookie on the dashboard's
      # domain from here, so we pass the session token through the URL to the
      # dashboard's /auth/accept route, which then sets the cookie on its own
      # domain and redirects to the final destination. Invite acceptance is
      # handled entirely on the dashboard via a pending_invite cookie stored
      # there. This is a stopgap until both services share a parent domain
      # (see project memory).
      redirect_to handoff_url(session.session_token, after_sign_in_next(user)),
                  allow_other_host: true
    end

    def auth_hash
      request.env["omniauth.auth"]
    end

    def dashboard_url
      ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
    end

    def after_sign_in_next(user)
      if user.previously_new_record?
        "/onboarding"
      else
        "/#{user.personal_org&.slug}"
      end
    end

    def handoff_url(token, next_path)
      query = URI.encode_www_form(token: token, next: next_path)
      "#{dashboard_url}/auth/accept?#{query}"
    end
  end
end
