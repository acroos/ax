module Api
  module V1
    class GitlabConnectionsController < BaseController
      before_action :require_session_auth!
      before_action :find_org!, only: :show
      before_action :find_org_as_admin!, only: [ :connect_url, :destroy ]

      # GET /api/v1/orgs/:org_slug/gitlab_connection
      def show
        connection = @org.gitlab_connection
        user_role = current_user.role_in(@org)

        if connection&.active?
          repos = connection.repos.order(:platform_owner, :platform_repo).map do |repo|
            { id: repo.id, platform_owner: repo.platform_owner, platform_repo: repo.platform_repo }
          end

          render json: {
            connection: {
              id: connection.id,
              account_username: connection.account_username,
              status: connection.status,
              connected_at: connection.connected_at,
              last_synced_at: connection.last_synced_at,
              repos_count: connection.repos.count,
              repos: repos
            },
            user_role: user_role
          }
        else
          render json: { connection: nil, user_role: user_role }
        end
      end

      # POST /api/v1/orgs/:org_slug/gitlab_connection/connect_url
      def connect_url
        unless ENV["GITLAB_CLIENT_ID"].present?
          return render json: { error: "GitLab integration not configured" }, status: :service_unavailable
        end

        state = GitlabApp::StateToken.generate(
          org_slug: @org.slug,
          user_id: current_user.id
        )

        url = "https://gitlab.com/oauth/authorize?" + URI.encode_www_form(
          client_id: ENV["GITLAB_CLIENT_ID"],
          redirect_uri: gitlab_callback_url,
          response_type: "code",
          scope: "read_user api",
          state: state
        )

        render json: { connect_url: url }
      end

      # DELETE /api/v1/orgs/:org_slug/gitlab_connection
      def destroy
        connection = @org.gitlab_connection
        return head :not_found unless connection

        connection.update!(status: "revoked")
        connection.repos.update_all(gitlab_connection_id: nil)

        render json: { ok: true }
      end

      private

      def gitlab_callback_url
        base = ENV.fetch("API_BASE_URL", "https://ax.up.railway.app").chomp("/")
        "#{base}/gitlab/connections/callback"
      end
    end
  end
end
