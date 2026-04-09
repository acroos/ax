module Api
  module V1
    class WatchStatusController < BaseController
      before_action :require_api_key_auth!

      def index
        watched = WatchedRepo.includes(:repo).all

        render json: watched.map { |w|
          {
            repo_id: w.repo_id,
            poll_interval_seconds: w.poll_interval_seconds,
            last_polled_at: w.last_polled_at,
            enabled: w.enabled
          }
        }
      end
    end
  end
end
