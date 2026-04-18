require "rails_helper"

RSpec.describe "Team Memberships API", type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:org) { create(:organization, created_by: owner, plan: "pro") }
  let!(:owner_membership) { create(:org_membership, organization: org, user: owner, role: "owner") }
  let!(:admin_membership) { create(:org_membership, organization: org, user: admin, role: "admin") }
  let!(:member_membership) { create(:org_membership, organization: org, user: member, role: "member") }
  let!(:team) { create(:team, slug: "frontend", organization: org, created_by: owner) }

  def session_headers(user)
    session = UserSession.create!(user: user, expires_at: 30.days.from_now)
    { "X-Ax-Session" => session.session_token }
  end

  describe "GET /api/v1/orgs/:slug/teams/:team_slug/members" do
    before do
      create(:team_membership, team: team, org_membership: member_membership)
    end

    it "lists team members for admins" do
      get "/api/v1/orgs/#{org.slug}/teams/frontend/members", headers: session_headers(admin)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
      expect(body[0]["user"]["github_username"]).to eq(member.github_username)
    end

    it "rejects access for regular members" do
      get "/api/v1/orgs/#{org.slug}/teams/frontend/members", headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /api/v1/orgs/:slug/teams/:team_slug/members" do
    it "allows admins to add members" do
      post "/api/v1/orgs/#{org.slug}/teams/frontend/members",
        params: { org_membership_id: member_membership.id },
        headers: session_headers(admin)

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["user"]["github_username"]).to eq(member.github_username)
      expect(team.team_memberships.count).to eq(1)
    end

    it "rejects duplicate memberships" do
      create(:team_membership, team: team, org_membership: member_membership)

      post "/api/v1/orgs/#{org.slug}/teams/frontend/members",
        params: { org_membership_id: member_membership.id },
        headers: session_headers(admin)

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "rejects org_membership from different org" do
      other_org = create(:organization, created_by: owner)
      other_membership = create(:org_membership, organization: other_org, user: create(:user))

      post "/api/v1/orgs/#{org.slug}/teams/frontend/members",
        params: { org_membership_id: other_membership.id },
        headers: session_headers(admin)

      expect(response).to have_http_status(:not_found)
    end

    it "rejects creation by regular members" do
      post "/api/v1/orgs/#{org.slug}/teams/frontend/members",
        params: { org_membership_id: admin_membership.id },
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /api/v1/orgs/:slug/teams/:team_slug/members/:id" do
    it "allows admins to remove team members" do
      tm = create(:team_membership, team: team, org_membership: member_membership)

      delete "/api/v1/orgs/#{org.slug}/teams/frontend/members/#{tm.id}",
        headers: session_headers(admin)

      expect(response).to have_http_status(:no_content)
      expect(TeamMembership.exists?(tm.id)).to be false
    end

    it "rejects removal by regular members" do
      tm = create(:team_membership, team: team, org_membership: member_membership)

      delete "/api/v1/orgs/#{org.slug}/teams/frontend/members/#{tm.id}",
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end

    it "returns 404 for nonexistent membership" do
      delete "/api/v1/orgs/#{org.slug}/teams/frontend/members/999999",
        headers: session_headers(admin)

      expect(response).to have_http_status(:not_found)
    end
  end
end
