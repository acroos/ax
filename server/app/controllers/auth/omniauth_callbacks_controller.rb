module Auth
  class OmniauthCallbacksController < ApplicationController
    # ActionController::API does not include the cookies helper by default.
    # We need it here for reading the signed pending_invite cookie and for
    # setting the session cookie after sign-in.
    include ActionController::Cookies

    def github
      Rails.logger.info("[omniauth] github callback: auth_hash present=#{!auth_hash.nil?} omniauth_error=#{request.env['omniauth.error']&.class} omniauth_error_type=#{request.env['omniauth.error.type']}")

      if auth_hash.nil?
        Rails.logger.error("[omniauth] github callback reached with nil auth_hash; env keys: #{request.env.keys.grep(/omniauth/).inspect}")
        return render json: { error: "Authentication failed: missing auth_hash" }, status: :unauthorized
      end

      user = AuthService.find_or_create_from_github(auth_hash)
      session = UserSession.create_for(user, request)

      # Check for pending invite token in cookie
      if (invite_token = cookies.signed[:pending_invite])
        cookies.delete(:pending_invite)
        invite = Invite.pending.find_by(token: invite_token)
        invite&.accept!(user)
      end

      response.set_cookie(:_ax_session, {
        value: session.session_token,
        httponly: true,
        secure: Rails.env.production?,
        same_site: :lax,
        path: "/",
        expires: 30.days.from_now
      })

      redirect_to after_sign_in_path(user), allow_other_host: true
    end

    def failure
      error = request.env["omniauth.error"]
      error_type = request.env["omniauth.error.type"]
      strategy = request.env["omniauth.error.strategy"]&.name

      Rails.logger.error("[omniauth] failure: message=#{params[:message].inspect} type=#{error_type.inspect} strategy=#{strategy.inspect} error_class=#{error&.class} error_message=#{error&.message}")

      render json: {
        error: "Authentication failed: #{params[:message] || error_type || error&.message || 'unknown'}",
        type: error_type,
        strategy: strategy
      }, status: :unauthorized
    end

    private

    def auth_hash
      request.env["omniauth.auth"]
    end

    def after_sign_in_path(user)
      dashboard_url = ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
      if user.previously_new_record?
        "#{dashboard_url}/onboarding"
      else
        "#{dashboard_url}/#{user.personal_org&.slug}"
      end
    end
  end
end
