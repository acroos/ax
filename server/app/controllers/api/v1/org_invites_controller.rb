module Api
  module V1
    class OrgInvitesController < BaseController
      before_action :require_session_auth!
      before_action :find_org!
      before_action :find_org_as_admin!, only: [ :create, :destroy ]

      def index
        render json: @org.invites.pending.map { |i|
          {
            id: i.id,
            github_username: i.github_username,
            gitlab_username: i.gitlab_username,
            platform: i.platform,
            role: i.role,
            token: i.token,
            expires_at: i.expires_at
          }
        }
      end

      def create
        # On Pro plans, seats auto-purchase when the invite is accepted, so
        # we don't gate invite creation on the current seat count.
        unless @org.plan == "pro" && @org.subscription&.active_or_trialing?
          enforce_limit!(:max_members, @org.org_memberships.count + @org.invites.pending.count)
          return if performed?
        end

        platform = params[:platform] || "github"
        invite_attrs = { role: params[:role], invited_by: current_user, platform: platform }

        if platform == "gitlab"
          invite_attrs[:gitlab_username] = params[:gitlab_username]
        else
          invite_attrs[:github_username] = params[:github_username]
        end

        invite = @org.invites.create!(invite_attrs)
        dashboard_url = ENV.fetch("DASHBOARD_URL", "http://localhost:3333").chomp("/")
        render json: {
          token: invite.token,
          link: "#{dashboard_url}/invite/#{invite.token}"
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
