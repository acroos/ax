module Auth
  class OmniauthCallbacksController < ApplicationController
    def github
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

      redirect_to after_sign_in_path(user)
    end

    def failure
      render json: { error: "Authentication failed: #{params[:message]}" }, status: :unauthorized
    end

    private

    def auth_hash
      request.env["omniauth.auth"]
    end

    def after_sign_in_path(user)
      dashboard_url = ENV.fetch("DASHBOARD_URL", "http://localhost:3333")
      if user.previously_new_record?
        "#{dashboard_url}/onboarding"
      else
        "#{dashboard_url}/#{user.personal_org&.slug}"
      end
    end
  end
end
