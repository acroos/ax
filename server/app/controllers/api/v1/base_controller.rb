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

      def history_cutoff
        plan = PlanService.for(@org)
        days = plan.capability(:history_days)
        return nil if days.nil? || days == Float::INFINITY
        days.days.ago
      end
    end
  end
end
