require "rails_helper"

RSpec.describe "GitHub Installations API", type: :request do
  let(:owner) { create(:user) }
  let(:session) { UserSession.create!(user: owner, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }

  let(:organization) { create(:organization, created_by: owner) }
  before { create(:org_membership, organization: organization, user: owner, role: "owner") }

  describe "GET /api/v1/orgs/:slug/github_installation" do
    it "requires session auth" do
      get "/api/v1/orgs/#{organization.slug}/github_installation"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns null installation when none exists" do
      get "/api/v1/orgs/#{organization.slug}/github_installation", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["installation"]).to be_nil
      expect(body["user_role"]).to eq("owner")
    end

    it "returns the active installation" do
      installation = create(:github_installation, organization: organization, installed_by: owner)

      get "/api/v1/orgs/#{organization.slug}/github_installation", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["installation"]["id"]).to eq(installation.id)
      expect(body["installation"]["status"]).to eq("active")
      expect(body["installation"]["account_login"]).to eq(installation.account_login)
      expect(body["installation"]["repos"]).to eq([])
      expect(body["user_role"]).to eq("owner")
    end

    it "includes connected repos in the response" do
      installation = create(:github_installation, organization: organization, installed_by: owner)
      repo1 = create(:repo, github_installation: installation, platform_owner: "acme", platform_repo: "api")
      repo2 = create(:repo, github_installation: installation, platform_owner: "acme", platform_repo: "web")

      get "/api/v1/orgs/#{organization.slug}/github_installation", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      repos = body["installation"]["repos"]
      expect(repos.length).to eq(2)
      expect(repos.map { |r| r["platform_repo"] }).to contain_exactly("api", "web")
      expect(body["installation"]["repos_count"]).to eq(2)
    end

    it "excludes deleted installations" do
      create(:github_installation, organization: organization, status: "deleted")

      get "/api/v1/orgs/#{organization.slug}/github_installation", headers: headers
      body = JSON.parse(response.body)
      expect(body["installation"]).to be_nil
    end

    context "as a member" do
      let(:member) { create(:user) }
      let(:member_session) { UserSession.create!(user: member, expires_at: 30.days.from_now) }
      let(:member_headers) { { "X-Ax-Session" => member_session.session_token } }

      before { create(:org_membership, organization: organization, user: member, role: "member") }

      it "returns installation with member role" do
        create(:github_installation, organization: organization)

        get "/api/v1/orgs/#{organization.slug}/github_installation", headers: member_headers
        expect(response).to have_http_status(:ok)

        body = JSON.parse(response.body)
        expect(body["user_role"]).to eq("member")
      end
    end
  end

  describe "POST /api/v1/orgs/:slug/github_installation/install_url" do
    before do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("GITHUB_APP_SLUG").and_return("ax-metrics")
    end

    it "requires session auth" do
      post "/api/v1/orgs/#{organization.slug}/github_installation/install_url"
      expect(response).to have_http_status(:unauthorized)
    end

    it "requires admin role" do
      member = create(:user)
      create(:org_membership, organization: organization, user: member, role: "member")
      member_session = UserSession.create!(user: member, expires_at: 30.days.from_now)

      post "/api/v1/orgs/#{organization.slug}/github_installation/install_url",
        headers: { "X-Ax-Session" => member_session.session_token }

      expect(response).to have_http_status(:forbidden)
    end

    it "returns a signed install URL" do
      post "/api/v1/orgs/#{organization.slug}/github_installation/install_url", headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["install_url"]).to start_with("https://github.com/apps/ax-metrics/installations/new?state=")
    end

    it "returns 503 when GITHUB_APP_SLUG is not set" do
      allow(ENV).to receive(:[]).with("GITHUB_APP_SLUG").and_return(nil)

      post "/api/v1/orgs/#{organization.slug}/github_installation/install_url", headers: headers
      expect(response).to have_http_status(:service_unavailable)
    end
  end
end

RSpec.describe "GitHub App Installation Callback", type: :request do
  let(:owner) { create(:user) }
  let(:organization) { create(:organization, created_by: owner) }
  before { create(:org_membership, organization: organization, user: owner, role: "owner") }

  let(:state) { GithubApp::StateToken.generate(org_slug: organization.slug, user_id: owner.id) }

  let(:github_installation_response) do
    {
      id: 99999,
      account: { login: "test-org", type: "Organization" },
      target_type: "Organization",
      repository_selection: "all",
      permissions: { contents: "read", metadata: "read" },
      events: [ "pull_request" ]
    }
  end

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("GITHUB_APP_ID").and_return("12345")
    allow(ENV).to receive(:fetch).with("GITHUB_APP_PRIVATE_KEY").and_return(OpenSSL::PKey::RSA.generate(2048).to_pem)
    allow(ENV).to receive(:fetch).with("DASHBOARD_URL", anything).and_return("http://localhost:3333")
  end

  it "creates an installation and redirects to dashboard on success" do
    stub_request(:post, %r{api\.github\.com/app/installations/99999/access_tokens})
      .to_return(status: 201, body: { token: "ghs_fake", expires_at: 1.hour.from_now.iso8601 }.to_json, headers: { "Content-Type" => "application/json" })
    stub_request(:get, %r{api\.github\.com/app/installations/99999})
      .to_return(status: 200, body: github_installation_response.to_json, headers: { "Content-Type" => "application/json" })

    expect {
      get "/github/installations/callback", params: { installation_id: 99999, state: state }
    }.to change(GithubInstallation, :count).by(1)

    expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?installed=true")

    installation = GithubInstallation.last
    expect(installation.github_installation_id).to eq(99999)
    expect(installation.organization).to eq(organization)
    expect(installation.installed_by).to eq(owner)
    expect(installation.status).to eq("active")
    expect(installation.account_login).to eq("test-org")
  end

  it "redirects with error on invalid state" do
    get "/github/installations/callback", params: { installation_id: 99999, state: "bogus" }
    expect(response).to redirect_to("http://localhost:3333/login?error=invalid_state")
  end

  it "redirects with error when installation_id is missing" do
    get "/github/installations/callback", params: { state: state }
    expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?installed=false&error=missing_installation_id")
  end

  it "redirects with error when GitHub API fails" do
    stub_request(:get, %r{api\.github\.com/app/installations/99999})
      .to_return(status: 404, body: { message: "Not Found" }.to_json, headers: { "Content-Type" => "application/json" })

    get "/github/installations/callback", params: { installation_id: 99999, state: state }
    expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?installed=false&error=github_api_error")
  end

  it "is idempotent — updates an existing installation" do
    existing = create(:github_installation,
      organization: organization,
      github_installation_id: 99999,
      account_login: "old-name",
      status: "deleted"
    )

    stub_request(:get, %r{api\.github\.com/app/installations/99999})
      .to_return(status: 200, body: github_installation_response.to_json, headers: { "Content-Type" => "application/json" })

    expect {
      get "/github/installations/callback", params: { installation_id: 99999, state: state }
    }.not_to change(GithubInstallation, :count)

    existing.reload
    expect(existing.status).to eq("active")
    expect(existing.account_login).to eq("test-org")
  end

  context "without state (repo update via GitHub settings)" do
    it "updates the existing installation and redirects to org settings" do
      existing = create(:github_installation,
        organization: organization,
        github_installation_id: 99999,
        installed_by: owner,
        account_login: "test-org",
        repository_selection: "all"
      )

      updated_response = github_installation_response.merge(repository_selection: "selected")

      stub_request(:get, %r{api\.github\.com/app/installations/99999})
        .to_return(status: 200, body: updated_response.to_json, headers: { "Content-Type" => "application/json" })

      get "/github/installations/callback", params: { installation_id: 99999, setup_action: "update" }

      expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?installed=true")

      existing.reload
      expect(existing.repository_selection).to eq("selected")
      expect(existing.status).to eq("active")
    end

    it "redirects with error when installation is not found" do
      get "/github/installations/callback", params: { installation_id: 99999, setup_action: "update" }
      expect(response).to redirect_to("http://localhost:3333/login?error=invalid_state")
    end

    it "redirects with error when GitHub API fails" do
      create(:github_installation,
        organization: organization,
        github_installation_id: 99999,
        installed_by: owner
      )

      stub_request(:get, %r{api\.github\.com/app/installations/99999})
        .to_return(status: 404, body: { message: "Not Found" }.to_json, headers: { "Content-Type" => "application/json" })

      get "/github/installations/callback", params: { installation_id: 99999, setup_action: "update" }
      expect(response).to redirect_to("http://localhost:3333/#{organization.slug}/settings?installed=false&error=github_api_error")
    end
  end
end
