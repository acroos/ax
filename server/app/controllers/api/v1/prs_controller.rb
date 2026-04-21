module Api
  module V1
    class PrsController < BaseController
      include PrSerialization

      before_action :require_session_auth!

      def show
        pr = Pr
          .joins(repo: :organization)
          .joins(:pr_metrics)
          .includes(:pr_metrics, repo: :organization)
          .where(pr_metrics: { metrics_finalized: true })
          .find(params[:id])

        # Verify the current user has access to this PR's org
        org = pr.repo.organization
        head(:forbidden) and return unless current_user&.member_of?(org)

        @org = org
        cutoff = history_cutoff
        if cutoff && pr.created_at_source.present?
          head(:forbidden) and return if pr.created_at_source < cutoff
        end

        render json: pr_with_metrics(pr)
      end

      private
    end
  end
end
