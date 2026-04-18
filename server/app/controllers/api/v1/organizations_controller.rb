module Api
  module V1
    class OrganizationsController < BaseController
      include PrSerialization

      before_action :require_session_auth!
      before_action :find_org!, only: [ :show, :update, :prs, :metrics ]
      before_action :find_org_as_admin!, only: [ :update ]

      def index
        orgs = current_user.organizations
        render json: orgs.map { |org|
          { slug: org.slug, name: org.name, is_personal: org.is_personal }
        }
      end

      def show
        render json: {
          slug: @org.slug,
          name: @org.name,
          is_personal: @org.is_personal,
          member_count: @org.org_memberships.count
        }
      end

      def create
        AuthService.ensure_can_create_org!(current_user)
        org = OrgService.create_org(current_user, org_params)
        render json: { slug: org.slug, name: org.name }, status: :created
      rescue AuthService::ForbiddenError => e
        render json: { error: e.message }, status: :forbidden
      end

      def update
        @org.update!(org_params)
        render json: { slug: @org.slug, name: @org.name }
      end

      def prs
        prs = Pr
          .joins(:repo)
          .where(repos: { organization_id: @org.id })
          .left_joins(:pr_metrics)
          .includes(:pr_metrics, :repo)
          .order(created_at: :desc)

        render json: prs.map { |pr| pr_with_metrics(pr) }
      end

      def metrics
        scope = PrMetrics
          .joins(pr: :repo)
          .where(repos: { organization_id: @org.id }, metrics_finalized: true)

        render json: MetricsAggregator.new(scope, window_days: parsed_range).call
      end

      private

      def org_params
        params.permit(:slug, :name)
      end
    end
  end
end
