module Api
  module V1
    class ApiKeysController < BaseController
      before_action :require_session_auth!

      def show
        key = current_user.api_key
        render json: {
          name: key&.name,
          created_at: key&.created_at,
          last_used_at: key&.last_used_at
        }
      end

      def rotate
        current_user.api_key&.update!(revoked: true)
        raw_key = ApiKey.generate_for(current_user)
        render json: { key: raw_key }
      end

      def reveal
        cache_key = "api_key_reveal:#{current_user.id}"
        raw_key = Rails.cache.read(cache_key)
        Rails.cache.delete(cache_key) if raw_key
        render json: { key: raw_key }
      end
    end
  end
end
