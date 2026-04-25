require "net/http"
require "json"
require "uri"

module GitlabApp
  class Client
    BASE_URL = "https://gitlab.com/api/v4"

    class Error < StandardError; end
    class AuthError < Error; end
    class NotFoundError < Error; end
    class RateLimitError < Error; end

    def initialize(connection)
      @connection = connection
    end

    def list_projects(page: 1, per_page: 100)
      get("/projects", membership: true, page: page, per_page: per_page, simple: true)
    end

    def get_merge_request(project_id, mr_iid)
      get("/projects/#{project_id}/merge_requests/#{mr_iid}")
    end

    def list_merge_request_commits(project_id, mr_iid)
      get("/projects/#{project_id}/merge_requests/#{mr_iid}/commits")
    end

    def get_merge_request_changes(project_id, mr_iid)
      get("/projects/#{project_id}/merge_requests/#{mr_iid}/changes")
    end

    def list_merge_requests(project_id, state: "all", updated_after: nil, page: 1, per_page: 100)
      params = { state: state, page: page, per_page: per_page }
      params[:updated_after] = updated_after.iso8601 if updated_after
      get("/projects/#{project_id}/merge_requests", **params)
    end

    def get_commit(project_id, sha)
      get("/projects/#{project_id}/repository/commits/#{sha}")
    end

    def list_pipelines(project_id, sha:)
      get("/projects/#{project_id}/pipelines", sha: sha)
    end

    def create_project_webhook(project_id, url:, secret:, events:)
      payload = {
        url: url,
        token: secret,
        push_events: false,
        merge_requests_events: events.include?(:merge_requests),
        pipeline_events: events.include?(:pipeline)
      }
      post("/projects/#{project_id}/hooks", payload)
    end

    def delete_project_webhook(project_id, hook_id)
      delete("/projects/#{project_id}/hooks/#{hook_id}")
    end

    private

    def get(path, **params)
      uri = URI("#{BASE_URL}#{path}")
      uri.query = URI.encode_www_form(params) if params.any?
      request = Net::HTTP::Get.new(uri)
      execute(request, uri)
    end

    def post(path, body)
      uri = URI("#{BASE_URL}#{path}")
      request = Net::HTTP::Post.new(uri)
      request.content_type = "application/json"
      request.body = body.to_json
      execute(request, uri)
    end

    def delete(path)
      uri = URI("#{BASE_URL}#{path}")
      request = Net::HTTP::Delete.new(uri)
      execute(request, uri)
    end

    def execute(request, uri)
      ensure_fresh_token!
      request["Authorization"] = "Bearer #{@connection.access_token_ciphertext}"

      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
        http.open_timeout = 10
        http.read_timeout = 30
        http.request(request)
      end

      handle_response(response)
    end

    def handle_response(response)
      case response.code.to_i
      when 200..299
        return nil if response.body.nil? || response.body.empty?
        JSON.parse(response.body, symbolize_names: true)
      when 401
        raise AuthError, "GitLab API authentication failed"
      when 404
        raise NotFoundError, "GitLab API resource not found"
      when 429
        raise RateLimitError, "GitLab API rate limit exceeded"
      else
        raise Error, "GitLab API error (#{response.code}): #{response.body}"
      end
    end

    def ensure_fresh_token!
      return unless @connection.token_expires_at.present?
      return if @connection.token_expires_at > 5.minutes.from_now

      refresh_access_token!
    end

    def refresh_access_token!
      uri = URI("https://gitlab.com/oauth/token")
      response = Net::HTTP.post_form(uri, {
        grant_type: "refresh_token",
        refresh_token: @connection.refresh_token_ciphertext,
        client_id: ENV["GITLAB_CLIENT_ID"],
        client_secret: ENV["GITLAB_CLIENT_SECRET"]
      })

      unless response.is_a?(Net::HTTPSuccess)
        @connection.update!(status: "expired")
        raise AuthError, "Failed to refresh GitLab token"
      end

      data = JSON.parse(response.body)
      @connection.update!(
        access_token_ciphertext: data["access_token"],
        refresh_token_ciphertext: data["refresh_token"],
        token_expires_at: Time.current + data["expires_in"].to_i.seconds,
        token_scopes: data["scope"]
      )
    end
  end
end
