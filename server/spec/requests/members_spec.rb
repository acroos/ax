require "rails_helper"

RSpec.describe "Members API", type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:org) { create(:organization, created_by: owner) }

  before do
    create(:org_membership, organization: org, user: owner, role: "owner")
    create(:org_membership, organization: org, user: admin, role: "admin")
    create(:org_membership, organization: org, user: member, role: "member")
  end

  def session_headers(user)
    session = UserSession.create!(user: user, expires_at: 30.days.from_now)
    { "X-Ax-Session" => session.session_token }
  end

  describe "GET /api/v1/orgs/:slug/members" do
    it "requires session auth" do
      get "/api/v1/orgs/#{org.slug}/members"
      expect(response).to have_http_status(:unauthorized)
    end

    it "allows regular members to list members" do
      get "/api/v1/orgs/#{org.slug}/members", headers: session_headers(member)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["members"].length).to eq(3)
      expect(body["current_user_role"]).to eq("member")
    end

    it "returns admin role for admins" do
      get "/api/v1/orgs/#{org.slug}/members", headers: session_headers(admin)

      body = JSON.parse(response.body)
      expect(body["current_user_role"]).to eq("admin")
    end

    it "returns 403 for non-members" do
      outsider = create(:user)
      get "/api/v1/orgs/#{org.slug}/members", headers: session_headers(outsider)
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PUT /api/v1/orgs/:slug/members/:id" do
    let(:member_membership) { OrgMembership.find_by(user: member, organization: org) }

    it "allows admins to update roles" do
      put "/api/v1/orgs/#{org.slug}/members/#{member_membership.id}",
        params: { role: "admin" },
        headers: session_headers(admin)

      expect(response).to have_http_status(:ok)
      expect(member_membership.reload.role).to eq("admin")
    end

    it "rejects role changes from regular members" do
      put "/api/v1/orgs/#{org.slug}/members/#{member_membership.id}",
        params: { role: "admin" },
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /api/v1/orgs/:slug/members/:id" do
    it "allows admins to remove members" do
      membership = OrgMembership.find_by(user: member, organization: org)

      delete "/api/v1/orgs/#{org.slug}/members/#{membership.id}",
        headers: session_headers(admin)

      expect(response).to have_http_status(:no_content)
      expect(OrgMembership.find_by(id: membership.id)).to be_nil
    end

    it "rejects removal from regular members" do
      membership = OrgMembership.find_by(user: admin, organization: org)

      delete "/api/v1/orgs/#{org.slug}/members/#{membership.id}",
        headers: session_headers(member)

      expect(response).to have_http_status(:forbidden)
    end

    it "invalidates sessions for removed user with no other org memberships" do
      membership = OrgMembership.find_by(user: member, organization: org)
      member_session = UserSession.create!(user: member, expires_at: 30.days.from_now)

      delete "/api/v1/orgs/#{org.slug}/members/#{membership.id}",
        headers: session_headers(admin)

      expect(response).to have_http_status(:no_content)
      expect(UserSession.find_by(id: member_session.id)).to be_nil
    end

    it "preserves sessions for removed user who is still in another org" do
      other_org = create(:organization)
      create(:org_membership, organization: other_org, user: member, role: "member")

      membership = OrgMembership.find_by(user: member, organization: org)
      member_session = UserSession.create!(user: member, expires_at: 30.days.from_now)

      delete "/api/v1/orgs/#{org.slug}/members/#{membership.id}",
        headers: session_headers(admin)

      expect(response).to have_http_status(:no_content)
      expect(UserSession.find_by(id: member_session.id)).to be_present
    end

    it "decreases the Stripe seat count for Pro orgs" do
      org.update!(plan: "pro")
      create(:subscription, organization: org, quantity: 3, status: "active")
      allow(SeatService).to receive(:remove_seat!)

      membership = OrgMembership.find_by(user: member, organization: org)

      delete "/api/v1/orgs/#{org.slug}/members/#{membership.id}",
        headers: session_headers(admin)

      expect(response).to have_http_status(:no_content)
      expect(SeatService).to have_received(:remove_seat!).with(org)
    end

    it "still removes the member when the Stripe seat decrease fails" do
      org.update!(plan: "pro")
      create(:subscription, organization: org, quantity: 3, status: "active")
      allow(SeatService).to receive(:remove_seat!).and_raise(StripeService::Error, "boom")

      membership = OrgMembership.find_by(user: member, organization: org)

      delete "/api/v1/orgs/#{org.slug}/members/#{membership.id}",
        headers: session_headers(admin)

      expect(response).to have_http_status(:no_content)
      expect(OrgMembership.find_by(id: membership.id)).to be_nil
    end
  end
end
