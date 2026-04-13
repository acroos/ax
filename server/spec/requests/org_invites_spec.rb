require "rails_helper"

RSpec.describe "Org Invites API", type: :request do
  let(:owner) { create(:user) }
  let(:member) { create(:user) }
  let(:org) { create(:organization, created_by: owner) }

  before do
    create(:org_membership, organization: org, user: owner, role: "owner")
    create(:org_membership, organization: org, user: member, role: "member")
  end

  def session_headers(user)
    session = UserSession.create!(user: user, expires_at: 30.days.from_now)
    { "X-Ax-Session" => session.session_token }
  end

  describe "GET /api/v1/orgs/:slug/invites" do
    it "requires session auth" do
      get "/api/v1/orgs/#{org.slug}/invites"
      expect(response).to have_http_status(:unauthorized)
    end

    it "allows regular members to list invites" do
      create(:invite, organization: org, invited_by: owner)

      get "/api/v1/orgs/#{org.slug}/invites", headers: session_headers(member)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
    end

    it "returns 403 for non-members" do
      outsider = create(:user)
      get "/api/v1/orgs/#{org.slug}/invites", headers: session_headers(outsider)
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /api/v1/orgs/:slug/invites" do
    it "allows admins to create invites" do
      post "/api/v1/orgs/#{org.slug}/invites",
        params: { github_username: "newuser", role: "member" },
        headers: session_headers(owner)

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["token"]).to be_present
      expect(body["link"]).to include("/invite/")
    end

    it "rejects invite creation from regular members" do
      post "/api/v1/orgs/#{org.slug}/invites",
        params: { github_username: "newuser", role: "member" },
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /api/v1/orgs/:slug/invites/:id" do
    it "allows admins to revoke invites" do
      invite = create(:invite, organization: org, invited_by: owner)

      delete "/api/v1/orgs/#{org.slug}/invites/#{invite.id}",
        headers: session_headers(owner)

      expect(response).to have_http_status(:no_content)
      expect(invite.reload.status).to eq("revoked")
    end

    it "rejects revocation from regular members" do
      invite = create(:invite, organization: org, invited_by: owner)

      delete "/api/v1/orgs/#{org.slug}/invites/#{invite.id}",
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end
end
