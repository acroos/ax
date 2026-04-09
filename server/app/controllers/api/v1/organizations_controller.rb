module Api
  module V1
    class OrganizationsController < BaseController
      before_action :require_session_auth!
      before_action :find_org!, only: [:show, :update]
      before_action :find_org_as_admin!, only: [:update]

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

      private

      def org_params
        params.permit(:slug, :name)
      end
    end
  end
end
