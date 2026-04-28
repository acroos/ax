module Api
  module V1
    class BaseController < ApplicationController
      private

      def require_api_key_auth!
        raw_key = request.headers["Authorization"]&.delete_prefix("Bearer ")
        api_key = ApiKey.authenticate(raw_key)
        @current_user = api_key&.user
        head :unauthorized unless @current_user
      end

      def require_session_auth!
        # The dashboard owns the _ax_session cookie on its own origin and
        # forwards the raw token to us as an X-Ax-Session header on
        # server-to-server calls. We intentionally do not use Rails' cookie
        # jar here because the value is not a signed/encrypted Rails cookie.
        token = request.headers["X-Ax-Session"]
        session = UserSession.active.find_by(session_token: token) if token.present?
        @current_user = session&.user
        head :unauthorized unless @current_user
      end

      def current_user
        @current_user
      end

      def find_org!
        @org = Organization.find_by!(slug: params[:slug] || params[:org_slug])
        head :forbidden unless current_user&.member_of?(@org)
      end

      def find_org_as_admin!
        find_org!
        head :forbidden unless current_user&.admin_or_owner_of?(@org)
      end

      def enforce_limit!(key, current_count)
        plan = PlanService.for(@org)
        return if plan.within_limit?(key, current_count)

        render json: {
          error: "Plan limit reached",
          limit: key.to_s,
          current: current_count,
          max: plan.capability(key),
          upgrade_required: true
        }, status: :forbidden
      end

      def find_team!
        find_org! unless @org
        @team = @org.teams.find_by!(slug: params[:team_slug])
        unless current_user.admin_or_owner_of?(@org) || team_member?(@team)
          head :forbidden
        end
      rescue ActiveRecord::RecordNotFound
        head :not_found
      end

      def find_team_as_admin!
        find_org! unless @org
        @team = @org.teams.find_by!(slug: params[:team_slug])
        head :forbidden unless current_user.admin_or_owner_of?(@org)
      rescue ActiveRecord::RecordNotFound
        head :not_found
      end

      def team_member?(team)
        membership = current_user.org_memberships.find_by(organization: @org)
        return false unless membership
        all_ids = [ team.id ] + team.descendant_team_ids
        TeamMembership.exists?(team_id: all_ids, org_membership_id: membership.id)
      end

      def require_teams_feature!
        unless PlanService.for(@org).can?(:teams)
          render json: { error: "Teams require a Pro plan", upgrade_required: true }, status: :forbidden
        end
      end

      VALID_RANGES = { "7d" => 7, "30d" => 30, "90d" => 90 }.freeze

      def parsed_range
        VALID_RANGES.fetch(params[:range], 30)
      end

      VALID_AGENT_TYPES = AgentRegistry::VALID_IDS

      def parsed_agent_type
        type = params[:agent_type].presence
        VALID_AGENT_TYPES.include?(type) ? type : nil
      end

      def apply_agent_type_filter(scope)
        agent_type = parsed_agent_type
        agent_type ? scope.where(sessions: { agent_type: agent_type }) : scope
      end

      def history_cutoff
        plan = PlanService.for(@org)
        days = plan.capability(:history_days)
        return nil if days.nil? || days == Float::INFINITY
        days.days.ago
      end
    end
  end
end
