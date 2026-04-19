module Api
  module V1
    class TeamMembershipsController < BaseController
      before_action :require_session_auth!
      before_action :find_org_as_admin!
      before_action :require_teams_feature!
      before_action :find_team_for_members!

      def index
        memberships = @team.team_memberships.includes(org_membership: :user)

        render json: memberships.map { |tm|
          {
            id: tm.id,
            org_membership_id: tm.org_membership_id,
            user: {
              id: tm.user.id,
              github_username: tm.user.github_username,
              display_name: tm.user.display_name,
              avatar_url: tm.user.avatar_url
            }
          }
        }
      end

      def create
        org_membership = @org.org_memberships.find(params[:org_membership_id])
        tm = @team.team_memberships.create!(org_membership: org_membership)

        render json: {
          id: tm.id,
          org_membership_id: tm.org_membership_id,
          user: {
            id: org_membership.user.id,
            github_username: org_membership.user.github_username,
            display_name: org_membership.user.display_name,
            avatar_url: org_membership.user.avatar_url
          }
        }, status: :created
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Org membership not found" }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def destroy
        tm = @team.team_memberships.find(params[:id])
        tm.destroy!
        head :no_content
      rescue ActiveRecord::RecordNotFound
        head :not_found
      end

      private

      def find_team_for_members!
        @team = @org.teams.find_by!(slug: params[:team_slug])
      rescue ActiveRecord::RecordNotFound
        head :not_found
      end
    end
  end
end
