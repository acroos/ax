require "rails_helper"

RSpec.describe "Teams API", type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:org) { create(:organization, created_by: owner, plan: "pro") }
  let!(:owner_membership) { create(:org_membership, organization: org, user: owner, role: "owner") }
  let!(:admin_membership) { create(:org_membership, organization: org, user: admin, role: "admin") }
  let!(:member_membership) { create(:org_membership, organization: org, user: member, role: "member") }

  def session_headers(user)
    session = UserSession.create!(user: user, expires_at: 30.days.from_now)
    { "X-Ax-Session" => session.session_token }
  end

  describe "plan enforcement" do
    it "returns 403 for free-plan orgs" do
      free_org = create(:organization, created_by: owner, plan: "free")
      create(:org_membership, organization: free_org, user: owner, role: "owner")

      get "/api/v1/orgs/#{free_org.slug}/teams", headers: session_headers(owner)

      expect(response).to have_http_status(:forbidden)
      body = JSON.parse(response.body)
      expect(body["upgrade_required"]).to be true
    end
  end

  describe "GET /api/v1/orgs/:slug/teams" do
    let!(:frontend) { create(:team, slug: "frontend", name: "Frontend", organization: org, created_by: owner) }
    let!(:backend) { create(:team, slug: "backend", name: "Backend", organization: org, created_by: owner) }

    before do
      create(:team_membership, team: frontend, org_membership: member_membership)
    end

    it "returns all teams for admins" do
      get "/api/v1/orgs/#{org.slug}/teams", headers: session_headers(admin)

      expect(response).to have_http_status(:ok)
      slugs = JSON.parse(response.body).map { |t| t["slug"] }
      expect(slugs).to contain_exactly("frontend", "backend")
    end

    it "returns only member's teams for regular members" do
      get "/api/v1/orgs/#{org.slug}/teams", headers: session_headers(member)

      expect(response).to have_http_status(:ok)
      slugs = JSON.parse(response.body).map { |t| t["slug"] }
      expect(slugs).to eq([ "frontend" ])
    end

    it "requires auth" do
      get "/api/v1/orgs/#{org.slug}/teams"
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/orgs/:slug/teams" do
    it "allows admins to create teams" do
      post "/api/v1/orgs/#{org.slug}/teams",
        params: { name: "Platform" },
        headers: session_headers(admin)

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["slug"]).to eq("platform")
      expect(body["name"]).to eq("Platform")
    end

    it "allows creating nested teams" do
      parent = create(:team, slug: "engineering", organization: org, created_by: owner)

      post "/api/v1/orgs/#{org.slug}/teams",
        params: { name: "Frontend", parent_team_slug: "engineering" },
        headers: session_headers(admin)

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["parent_team_slug"]).to eq("engineering")
    end

    it "rejects creation by regular members" do
      post "/api/v1/orgs/#{org.slug}/teams",
        params: { name: "Nope" },
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end

    it "returns 404 for nonexistent parent team" do
      post "/api/v1/orgs/#{org.slug}/teams",
        params: { name: "Orphan", parent_team_slug: "nonexistent" },
        headers: session_headers(admin)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /api/v1/orgs/:slug/teams/:team_slug" do
    let!(:team) { create(:team, slug: "frontend", organization: org, created_by: owner) }

    before do
      create(:team_membership, team: team, org_membership: member_membership)
    end

    it "returns team detail for members" do
      get "/api/v1/orgs/#{org.slug}/teams/frontend", headers: session_headers(member)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["slug"]).to eq("frontend")
      expect(body["members"]).to be_an(Array)
    end

    it "returns 403 for non-team members" do
      other_member = create(:user)
      create(:org_membership, organization: org, user: other_member, role: "member")

      get "/api/v1/orgs/#{org.slug}/teams/frontend", headers: session_headers(other_member)

      expect(response).to have_http_status(:forbidden)
    end

    it "allows admins to view any team" do
      get "/api/v1/orgs/#{org.slug}/teams/frontend", headers: session_headers(admin)

      expect(response).to have_http_status(:ok)
    end
  end

  describe "PUT /api/v1/orgs/:slug/teams/:team_slug" do
    let!(:team) { create(:team, slug: "frontend", name: "Frontend", organization: org, created_by: owner) }

    it "allows admins to update team name" do
      put "/api/v1/orgs/#{org.slug}/teams/frontend",
        params: { name: "Frontend Web" },
        headers: session_headers(admin)

      expect(response).to have_http_status(:ok)
      expect(team.reload.name).to eq("Frontend Web")
    end

    it "rejects updates from regular members" do
      create(:team_membership, team: team, org_membership: member_membership)

      put "/api/v1/orgs/#{org.slug}/teams/frontend",
        params: { name: "Nope" },
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /api/v1/orgs/:slug/teams/:team_slug" do
    it "cascade-deletes team and all descendants" do
      parent = create(:team, slug: "engineering", organization: org, created_by: owner)
      child = create(:team, slug: "frontend", organization: org, parent_team: parent, created_by: owner)
      _grandchild = create(:team, slug: "react", organization: org, parent_team: child, created_by: owner)

      delete "/api/v1/orgs/#{org.slug}/teams/engineering", headers: session_headers(admin)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["deleted_count"]).to eq(3)
      expect(org.teams.reload.count).to eq(0)
    end

    it "rejects deletion by regular members" do
      team = create(:team, slug: "frontend", organization: org, created_by: owner)
      create(:team_membership, team: team, org_membership: member_membership)

      delete "/api/v1/orgs/#{org.slug}/teams/frontend", headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /api/v1/orgs/:slug/teams/:team_slug/prs" do
    let!(:team) { create(:team, slug: "frontend", organization: org, created_by: owner) }
    let!(:repo) { create(:repo, organization: org, github_owner: "acme", github_repo: "app") }

    before do
      create(:team_membership, team: team, org_membership: member_membership)
      create(:pr, repo: repo, number: 1, author: member.github_username, title: "Team PR")
      create(:pr, repo: repo, number: 2, author: "outsider", title: "Other PR")
    end

    it "returns only PRs authored by team members" do
      get "/api/v1/orgs/#{org.slug}/teams/frontend/prs", headers: session_headers(member)

      expect(response).to have_http_status(:ok)
      prs = JSON.parse(response.body)
      expect(prs.length).to eq(1)
      expect(prs[0]["author"]).to eq(member.github_username)
    end
  end

  describe "GET /api/v1/orgs/:slug/teams/:team_slug/metrics" do
    let!(:team) { create(:team, slug: "frontend", organization: org, created_by: owner) }
    let!(:repo) { create(:repo, organization: org, github_owner: "acme", github_repo: "app") }

    before do
      create(:team_membership, team: team, org_membership: member_membership)

      team_pr = create(:pr, repo: repo, number: 1, author: member.github_username, state: "merged", merged_at: 1.day.ago)
      create(:pr_metrics, pr: team_pr, metrics_finalized: true, finalized_at: 1.day.ago,
             post_open_commits: 2, iteration_depth: 3)

      other_pr = create(:pr, repo: repo, number: 2, author: "outsider", state: "merged", merged_at: 1.day.ago)
      create(:pr_metrics, pr: other_pr, metrics_finalized: true, finalized_at: 1.day.ago,
             post_open_commits: 10, iteration_depth: 20)
    end

    it "returns metrics scoped to team members only" do
      get "/api/v1/orgs/#{org.slug}/teams/frontend/metrics", headers: session_headers(member)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["totalPRs"]).to eq(1)
      expect(body["metrics"]["post-open-commits"]["current"]).to eq(2.0)
    end
  end
end
