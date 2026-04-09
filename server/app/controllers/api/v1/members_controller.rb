module Api
  module V1
    class MembersController < BaseController
      before_action :require_session_auth!
      before_action :find_org_as_admin!

      def index
        memberships = @org.org_memberships.includes(:user)
        render json: memberships.map { |m|
          {
            id: m.id,
            role: m.role,
            joined_at: m.joined_at,
            user: {
              id: m.user.id,
              github_username: m.user.github_username,
              display_name: m.user.display_name,
              avatar_url: m.user.avatar_url
            }
          }
        }
      end

      def update
        membership = @org.org_memberships.find(params[:id])
        membership.update!(role: params[:role])
        render json: { id: membership.id, role: membership.role }
      end

      def destroy
        membership = @org.org_memberships.find(params[:id])
        membership.destroy!
        head :no_content
      end
    end
  end
end
