module Auth
  class SessionsController < Api::V1::BaseController
    before_action :require_session_auth!, only: [:me, :destroy]

    def me
      render json: {
        id: current_user.id,
        github_username: current_user.github_username,
        display_name: current_user.display_name,
        email: current_user.email,
        avatar_url: current_user.avatar_url,
        organizations: current_user.organizations.map { |org|
          { slug: org.slug, name: org.name, is_personal: org.is_personal }
        }
      }
    end

    def destroy
      token = cookies[:_ax_session]
      UserSession.find_by(session_token: token)&.destroy
      cookies.delete(:_ax_session)
      head :no_content
    end
  end
end
