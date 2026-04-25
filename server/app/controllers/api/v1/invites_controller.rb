module Api
  module V1
    class InvitesController < BaseController
      before_action :require_session_auth!

      def create
        invite = Invite.pending.find_by(token: params[:token])
        return render json: { error: "Invite not found or expired" }, status: :not_found unless invite

        if current_user.member_of?(invite.organization)
          return render json: { org_slug: invite.organization.slug, already_member: true }
        end

        unless invite_matches_user?(invite, current_user)
          return render json: { error: "This invite is for a different user" }, status: :forbidden
        end

        invite.accept!(current_user)
        render json: { org_slug: invite.organization.slug }
      rescue Invite::MemberLimitReached
        render json: { error: "This organization has reached its member limit." }, status: :forbidden
      rescue StripeService::Error, Stripe::StripeError => e
        Rails.logger.error("Failed to add seat for invite #{invite.id}: #{e.message}")
        render json: { error: "Could not add a seat. Please contact the organization owner." }, status: :payment_required
      end

      private

      def invite_matches_user?(invite, user)
        case invite.platform
        when "gitlab"
          invite.gitlab_username == user.gitlab_username
        else
          invite.github_username == user.github_username
        end
      end
    end
  end
end
