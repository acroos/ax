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

        invite.accept!(current_user)
        render json: { org_slug: invite.organization.slug }
      rescue Invite::MemberLimitReached
        render json: { error: "This organization has reached its member limit." }, status: :forbidden
      rescue StripeService::Error, Stripe::StripeError => e
        Rails.logger.error("Failed to add seat for invite #{invite.id}: #{e.message}")
        render json: { error: "Could not add a seat. Please contact the organization owner." }, status: :payment_required
      end
    end
  end
end
