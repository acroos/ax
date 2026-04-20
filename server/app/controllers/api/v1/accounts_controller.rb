module Api
  module V1
    class AccountsController < BaseController
      before_action :require_session_auth!

      def export
        render json: PersonalDataExportService.new(current_user).call
      end

      def destroy
        service = AccountDeletionService.new(current_user)
        service.call!
        head :no_content
      rescue AccountDeletionService::SoleOwnerError => e
        render json: {
          error: "Cannot delete account while sole owner of organizations",
          organizations: e.organizations.map { |org| { slug: org.slug, name: org.name } }
        }, status: :conflict
      end
    end
  end
end
