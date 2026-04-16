module Api
  module V1
    class OrganizationsController < BaseController
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

        render json: MetricsAggregator.new(scope).call
      end

      private

      def org_params
        params.permit(:slug, :name)
      end

      def pr_with_metrics(pr)
        m = pr.pr_metrics
        {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          branch: pr.branch,
          state: pr.state,
          created_at: pr.created_at_source,
          merged_at: pr.merged_at,
          closed_at: pr.closed_at,
          url: pr.url,
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changed_files,
          author: pr.author,
          github_owner: pr.repo.github_owner,
          github_repo: pr.repo.github_repo,
          session_count: pr.session_prs.size,
          metrics: m ? {
            pr_number: pr.number,
            iteration_depth: m.iteration_depth,
            post_open_commits: m.post_open_commits,
            ci_success_rate: m.ci_success_rate,
            line_revisit_rate: m.line_revisit_rate,
            token_cost_usd: m.token_cost_usd,
            cache_hit_rate: m.cache_hit_rate,
            sidechain_rate: m.sidechain_rate,
            re_read_rate: m.re_read_rate,
            autonomy_score: m.autonomy_score,
            metrics_finalized: m.metrics_finalized,
            finalized_at: m.finalized_at
          } : nil
        }
      end
    end
  end
end
