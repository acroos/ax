module Api
  module V1
    class PingController < BaseController
      before_action :require_api_key_auth!

      def show
        render json: { status: "ok" }
      end
    end
  end
end
