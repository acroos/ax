require "rails_helper"

RSpec.describe "Account Export API", type: :request do
  let(:user) { create(:user, github_username: "exportuser") }
  let(:session) { UserSession.create!(user: user, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }

  describe "GET /api/v1/account/export" do
    it "requires session auth" do
      get "/api/v1/account/export"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns user data" do
      get "/api/v1/account/export", headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["user"]["github_username"]).to eq("exportuser")
      expect(body["exported_at"]).to be_present
    end

    it "includes authored PRs" do
      repo = create(:repo, github_owner: "acme", github_repo: "widget")
      create(:pr, repo: repo, author: "exportuser", number: 42, title: "Fix bug")

      get "/api/v1/account/export", headers: headers

      body = JSON.parse(response.body)
      expect(body["pull_requests"].length).to eq(1)
      expect(body["pull_requests"].first["number"]).to eq(42)
      expect(body["pull_requests"].first["repo"]).to eq("acme/widget")
    end

    it "includes user sessions (coding)" do
      repo = create(:repo)
      create(:coding_session, repo: repo, pushed_by: "exportuser", branch: "feat/x")

      get "/api/v1/account/export", headers: headers

      body = JSON.parse(response.body)
      expect(body["sessions"].length).to eq(1)
      expect(body["sessions"].first["branch"]).to eq("feat/x")
    end

    it "includes organization memberships" do
      org = create(:organization, is_personal: false, created_by: user, slug: "test-org", name: "Test Org")
      create(:org_membership, organization: org, user: user, role: "member")

      get "/api/v1/account/export", headers: headers

      body = JSON.parse(response.body)
      expect(body["organizations"].length).to eq(1)
      expect(body["organizations"].first["slug"]).to eq("test-org")
      expect(body["organizations"].first["role"]).to eq("member")
    end

    it "does not include other users' data" do
      repo = create(:repo)
      create(:pr, repo: repo, author: "someone-else", number: 99)

      get "/api/v1/account/export", headers: headers

      body = JSON.parse(response.body)
      expect(body["pull_requests"]).to be_empty
    end
  end
end
