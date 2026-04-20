module Api
  module V1
    class AccountsController < BaseController
      before_action :require_session_auth!

      def export
        render json: PersonalDataExportService.new(current_user).call
      end
    end
  end
end
