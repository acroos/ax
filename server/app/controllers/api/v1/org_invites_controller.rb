module Api
  module V1
    class OrgInvitesController < BaseController
      before_action :require_session_auth!
      before_action :find_org_as_admin!

      def index
        render json: @org.invites.pending.map { |i|
          {
            id: i.id,
            github_username: i.github_username,
            role: i.role,
            token: i.token,
            expires_at: i.expires_at
          }
        }
      end

      def create
        invite = @org.invites.create!(
          github_username: params[:github_username],
          role: params[:role],
          invited_by: current_user
        )
        render json: {
          token: invite.token,
          link: "https://app.ax.dev/invite/#{invite.token}"
        }, status: :created
      end

      def destroy
        invite = @org.invites.find(params[:id])
        invite.update!(status: "revoked")
        head :no_content
      end
    end
  end
end
