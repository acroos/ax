require "rails_helper"

RSpec.describe "PR pagination", type: :request do
  let(:owner) { create(:user) }
  let(:org) { create(:organization, created_by: owner, plan: "pro") }
  let(:repo) { create(:repo, organization: org) }

  before do
    create(:org_membership, organization: org, user: owner, role: "owner")
  end

  def session_headers(user)
    session = UserSession.create!(user: user, expires_at: 30.days.from_now)
    { "X-Ax-Session" => session.session_token }
  end

  def create_prs(count)
    count.times do |i|
      create(:pr, repo: repo, created_at: (count - i).hours.ago)
    end
  end

  describe "GET /api/v1/orgs/:slug/prs" do
    it "returns paginated response with default per_page of 25" do
      create_prs(30)

      get "/api/v1/orgs/#{org.slug}/prs", headers: session_headers(owner)
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["data"].length).to eq(25)
      expect(body["pagination"]["has_more"]).to be true
      expect(body["pagination"]["next_cursor"]).to be_present
      expect(body["pagination"]["total"]).to eq(30)
    end

    it "returns all results when total is under per_page" do
      create_prs(5)

      get "/api/v1/orgs/#{org.slug}/prs", headers: session_headers(owner)
      body = JSON.parse(response.body)

      expect(body["data"].length).to eq(5)
      expect(body["pagination"]["has_more"]).to be false
      expect(body["pagination"]["next_cursor"]).to be_nil
      expect(body["pagination"]["total"]).to eq(5)
    end

    it "paginates through all results using cursors" do
      create_prs(30)

      # First page
      get "/api/v1/orgs/#{org.slug}/prs", headers: session_headers(owner)
      body = JSON.parse(response.body)
      first_page_ids = body["data"].map { |pr| pr["id"] }
      cursor = body["pagination"]["next_cursor"]

      expect(first_page_ids.length).to eq(25)
      expect(cursor).to be_present

      # Second page
      get "/api/v1/orgs/#{org.slug}/prs", params: { cursor: cursor }, headers: session_headers(owner)
      body = JSON.parse(response.body)
      second_page_ids = body["data"].map { |pr| pr["id"] }

      expect(second_page_ids.length).to eq(5)
      expect(body["pagination"]["has_more"]).to be false
      expect(body["pagination"]["next_cursor"]).to be_nil

      # No overlap between pages
      expect(first_page_ids & second_page_ids).to be_empty
    end

    it "respects per_page parameter" do
      create_prs(10)

      get "/api/v1/orgs/#{org.slug}/prs", params: { per_page: 3 }, headers: session_headers(owner)
      body = JSON.parse(response.body)

      expect(body["data"].length).to eq(3)
      expect(body["pagination"]["has_more"]).to be true
      expect(body["pagination"]["total"]).to eq(10)
    end

    it "caps per_page at 100" do
      create_prs(5)

      get "/api/v1/orgs/#{org.slug}/prs", params: { per_page: 200 }, headers: session_headers(owner)
      body = JSON.parse(response.body)

      # Should still work, just capped
      expect(body["data"].length).to eq(5)
    end

    it "returns results in created_at DESC order" do
      create_prs(5)

      get "/api/v1/orgs/#{org.slug}/prs", headers: session_headers(owner)
      body = JSON.parse(response.body)

      created_ats = body["data"].map { |pr| pr["created_at"] }.compact
      expect(created_ats).to eq(created_ats.sort.reverse)
    end

    it "includes PR metrics in paginated response" do
      pr = create(:pr, repo: repo)
      create(:pr_metrics, pr: pr, metrics_finalized: true)

      get "/api/v1/orgs/#{org.slug}/prs", headers: session_headers(owner)
      body = JSON.parse(response.body)

      expect(body["data"].first["metrics"]).to be_present
    end

    it "returns 400 for invalid cursor" do
      get "/api/v1/orgs/#{org.slug}/prs", params: { cursor: "garbage" }, headers: session_headers(owner)
      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "GET /api/v1/orgs/:slug/repos/:id/prs" do
    it "returns paginated results scoped to repo" do
      other_repo = create(:repo, organization: org)
      create_prs(5)
      create(:pr, repo: other_repo)

      get "/api/v1/orgs/#{org.slug}/repos/#{repo.id}/prs", headers: session_headers(owner)
      body = JSON.parse(response.body)

      expect(body["pagination"]["total"]).to eq(5)
      expect(body["data"].length).to eq(5)
    end
  end

  describe "GET /api/v1/orgs/:slug/me/prs" do
    it "returns paginated results for current user" do
      create(:pr, repo: repo, author: owner.github_username)
      create(:pr, repo: repo, author: "someone-else")

      get "/api/v1/orgs/#{org.slug}/me/prs", headers: session_headers(owner)
      body = JSON.parse(response.body)

      expect(body["pagination"]["total"]).to eq(1)
      expect(body["data"].length).to eq(1)
    end
  end
end
