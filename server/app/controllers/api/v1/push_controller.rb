module Api
  module V1
    class PushController < BaseController
      before_action :require_api_key_auth!

      # 10MB payload limit
      MAX_PAYLOAD_SIZE = 10.megabytes

      def create
        if request.content_length && request.content_length > MAX_PAYLOAD_SIZE
          return render json: { ok: false, error: "Payload too large" }, status: :payload_too_large
        end

        result = PushService.new(push_params).execute
        render json: { ok: true, entities: result }
      rescue PushService::Error => e
        render json: { ok: false, error: e.message }, status: :unprocessable_entity
      end

      private

      def push_params
        params.permit!.to_h
      end
    end
  end
end
