module Api
  module V1
    class MembersController < BaseController
      before_action :require_session_auth!
      before_action :find_org!
      before_action :find_org_as_admin!, only: [ :update, :destroy ]

      def index
        memberships = @org.org_memberships.includes(:user)
        current_membership = memberships.find { |m| m.user_id == current_user.id }
        render json: {
          members: memberships.map { |m|
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
          },
          current_user_role: current_membership&.role
        }
      end

      def update
        membership = @org.org_memberships.find(params[:id])
        membership.update!(role: params[:role])
        render json: { id: membership.id, role: membership.role }
      end

      def destroy
        membership = @org.org_memberships.find(params[:id])
        user_id = membership.user_id
        membership.destroy!
        unless OrgMembership.exists?(user_id: user_id)
          UserSession.where(user_id: user_id).delete_all
        end
        head :no_content
      end
    end
  end
end
