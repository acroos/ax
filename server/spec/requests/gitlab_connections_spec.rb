require "rails_helper"

RSpec.describe "GitLab Connections API", type: :request do
  let(:owner) { create(:user) }
  let(:session) { UserSession.create!(user: owner, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }

  let(:organization) { create(:organization, created_by: owner) }
  before { create(:org_membership, organization: organization, user: owner, role: "owner") }

  describe "GET /api/v1/orgs/:slug/gitlab_connection" do
    it "requires session auth" do
      get "/api/v1/orgs/#{organization.slug}/gitlab_connection"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns null connection when none exists" do
      get "/api/v1/orgs/#{organization.slug}/gitlab_connection", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["connection"]).to be_nil
      expect(body["user_role"]).to eq("owner")
    end

    it "returns the active connection" do
      connection = create(:gitlab_connection, organization: organization, connected_by: owner)

      get "/api/v1/orgs/#{organization.slug}/gitlab_connection", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["connection"]["id"]).to eq(connection.id)
      expect(body["connection"]["status"]).to eq("active")
      expect(body["connection"]["account_username"]).to eq(connection.account_username)
      expect(body["connection"]["repos"]).to eq([])
      expect(body["user_role"]).to eq("owner")
    end

    it "includes connected repos in the response" do
      connection = create(:gitlab_connection, organization: organization, connected_by: owner)
      create(:repo, gitlab_connection: connection, organization: organization, platform: "gitlab", platform_owner: "acme", platform_repo: "api")
      create(:repo, gitlab_connection: connection, organization: organization, platform: "gitlab", platform_owner: "acme", platform_repo: "web")

      get "/api/v1/orgs/#{organization.slug}/gitlab_connection", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      repos = body["connection"]["repos"]
      expect(repos.length).to eq(2)
      expect(repos.map { |r| r["platform_repo"] }).to contain_exactly("api", "web")
      expect(body["connection"]["repos_count"]).to eq(2)
    end

    it "returns null for revoked connections" do
      create(:gitlab_connection, organization: organization, connected_by: owner, status: "revoked")

      get "/api/v1/orgs/#{organization.slug}/gitlab_connection", headers: headers
      body = JSON.parse(response.body)
      expect(body["connection"]).to be_nil
    end

    context "as a member" do
      let(:member) { create(:user) }
      let(:member_session) { UserSession.create!(user: member, expires_at: 30.days.from_now) }
      let(:member_headers) { { "X-Ax-Session" => member_session.session_token } }

      before { create(:org_membership, organization: organization, user: member, role: "member") }

      it "returns connection with member role" do
        create(:gitlab_connection, organization: organization, connected_by: owner)

        get "/api/v1/orgs/#{organization.slug}/gitlab_connection", headers: member_headers
        expect(response).to have_http_status(:ok)

        body = JSON.parse(response.body)
        expect(body["user_role"]).to eq("member")
      end
    end
  end

  describe "POST /api/v1/orgs/:slug/gitlab_connection/connect_url" do
    before do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("GITLAB_CLIENT_ID").and_return("test-client-id")
      allow(ENV).to receive(:fetch).and_call_original
      allow(ENV).to receive(:fetch).with("API_BASE_URL", anything).and_return("https://ax.up.railway.app")
    end

    it "requires session auth" do
      post "/api/v1/orgs/#{organization.slug}/gitlab_connection/connect_url"
      expect(response).to have_http_status(:unauthorized)
    end

    it "requires admin role" do
      member = create(:user)
      create(:org_membership, organization: organization, user: member, role: "member")
      member_session = UserSession.create!(user: member, expires_at: 30.days.from_now)

      post "/api/v1/orgs/#{organization.slug}/gitlab_connection/connect_url",
        headers: { "X-Ax-Session" => member_session.session_token }

      expect(response).to have_http_status(:forbidden)
    end

    it "returns a signed connect URL" do
      post "/api/v1/orgs/#{organization.slug}/gitlab_connection/connect_url", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["connect_url"]).to start_with("https://gitlab.com/oauth/authorize?")
      expect(body["connect_url"]).to include("client_id=test-client-id")
      expect(body["connect_url"]).to include("scope=read_user+api")
    end

    it "returns 503 when GITLAB_CLIENT_ID is not set" do
      allow(ENV).to receive(:[]).with("GITLAB_CLIENT_ID").and_return(nil)

      post "/api/v1/orgs/#{organization.slug}/gitlab_connection/connect_url", headers: headers
      expect(response).to have_http_status(:service_unavailable)
    end
  end

  describe "DELETE /api/v1/orgs/:slug/gitlab_connection" do
    it "requires admin role" do
      member = create(:user)
      create(:org_membership, organization: organization, user: member, role: "member")
      member_session = UserSession.create!(user: member, expires_at: 30.days.from_now)

      delete "/api/v1/orgs/#{organization.slug}/gitlab_connection",
        headers: { "X-Ax-Session" => member_session.session_token }

      expect(response).to have_http_status(:forbidden)
    end

    it "revokes the connection and detaches repos" do
      connection = create(:gitlab_connection, organization: organization, connected_by: owner)
      repo = create(:repo, gitlab_connection: connection, organization: organization, platform: "gitlab")

      delete "/api/v1/orgs/#{organization.slug}/gitlab_connection", headers: headers
      expect(response).to have_http_status(:ok)

      connection.reload
      expect(connection.status).to eq("revoked")
      expect(repo.reload.gitlab_connection_id).to be_nil
    end

    it "returns 404 when no connection exists" do
      delete "/api/v1/orgs/#{organization.slug}/gitlab_connection", headers: headers
      expect(response).to have_http_status(:not_found)
    end
  end
end

RSpec.describe "GitLab OAuth Callback", type: :request do
  let(:owner) { create(:user) }
  let(:organization) { create(:organization, created_by: owner) }
  before { create(:org_membership, organization: organization, user: owner, role: "owner") }

  let(:state) { GitlabApp::StateToken.generate(org_slug: organization.slug, user_id: owner.id) }

  let(:token_response) do
    {
      access_token: "glpat-test-token",
      refresh_token: "glrt-test-refresh",
      expires_in: 7200,
      scope: "api read_user",
      token_type: "bearer"
    }.to_json
  end

  let(:user_response) do
    { id: 12345, username: "gitlab-user", name: "GitLab User", email: "gl@example.com" }.to_json
  end

  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("GITLAB_CLIENT_ID").and_return("test-client-id")
    allow(ENV).to receive(:[]).with("GITLAB_CLIENT_SECRET").and_return("test-secret")
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("API_BASE_URL", anything).and_return("https://ax.up.railway.app")
    allow(ENV).to receive(:fetch).with("DASHBOARD_URL", anything).and_return("http://localhost:3333")

    stub_request(:post, "https://gitlab.com/oauth/token")
      .to_return(status: 200, body: token_response, headers: { "Content-Type" => "application/json" })
    stub_request(:get, "https://gitlab.com/api/v4/user")
      .to_return(status: 200, body: user_response, headers: { "Content-Type" => "application/json" })
  end

  it "creates a connection and redirects to dashboard on success" do
    expect {
      get "/gitlab/connections/callback", params: { code: "test-auth-code", state: state }
    }.to change(GitlabConnection, :count).by(1)

    expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?gitlab_connected=true")

    connection = GitlabConnection.last
    expect(connection.organization).to eq(organization)
    expect(connection.connected_by).to eq(owner)
    expect(connection.status).to eq("active")
    expect(connection.account_username).to eq("gitlab-user")
    expect(connection.gitlab_user_id).to eq(12345)
  end

  it "redirects with error on invalid state" do
    get "/gitlab/connections/callback", params: { code: "test-auth-code", state: "bogus" }
    expect(response).to redirect_to("http://localhost:3333/login?error=invalid_state")
  end

  it "redirects with error when code is missing" do
    get "/gitlab/connections/callback", params: { state: state }
    expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?gitlab_connected=false&error=missing_code")
  end

  it "redirects with error when token exchange fails" do
    stub_request(:post, "https://gitlab.com/oauth/token")
      .to_return(status: 400, body: { error: "invalid_grant" }.to_json)

    get "/gitlab/connections/callback", params: { code: "bad-code", state: state }
    expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?gitlab_connected=false&error=token_exchange_failed")
  end

  it "is idempotent — updates an existing connection" do
    existing = create(:gitlab_connection, organization: organization, connected_by: owner, status: "revoked")

    expect {
      get "/gitlab/connections/callback", params: { code: "test-auth-code", state: state }
    }.not_to change(GitlabConnection, :count)

    existing.reload
    expect(existing.status).to eq("active")
    expect(existing.account_username).to eq("gitlab-user")
  end
end
