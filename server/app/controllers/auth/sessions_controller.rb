module Auth
  class SessionsController < Api::V1::BaseController
    before_action :require_session_auth!, only: [ :me, :destroy ]

    def me
      render json: {
        id: current_user.id,
        github_username: current_user.github_username,
        gitlab_username: current_user.gitlab_username,
        display_name: current_user.display_name,
        email: current_user.email,
        avatar_url: current_user.avatar_url,
        organizations: current_user.organizations.map { |org|
          { slug: org.slug, name: org.name, is_personal: org.is_personal, plan: org.plan }
        }
      }
    end

    def destroy
      # require_session_auth! has already resolved @current_user from the
      # X-Ax-Session header. Destroy that specific session record. The
      # dashboard is responsible for clearing its own _ax_session cookie.
      token = request.headers["X-Ax-Session"]
      UserSession.find_by(session_token: token)&.destroy if token.present?
      head :no_content
    end
  end
end
