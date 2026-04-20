require "rails_helper"

RSpec.describe "Organization Deletion API", type: :request do
  let(:owner) { create(:user) }
  let(:session) { UserSession.create!(user: owner, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }
  let(:org) { create(:organization, is_personal: false, created_by: owner, slug: "test-org", name: "Test Org") }

  before do
    create(:org_membership, organization: org, user: owner, role: "owner")
  end

  describe "DELETE /api/v1/orgs/:slug" do
    it "requires session auth" do
      delete "/api/v1/orgs/#{org.slug}"
      expect(response).to have_http_status(:unauthorized)
    end

    it "requires owner role" do
      member = create(:user)
      member_session = UserSession.create!(user: member, expires_at: 30.days.from_now)
      create(:org_membership, organization: org, user: member, role: "admin")

      delete "/api/v1/orgs/#{org.slug}", headers: { "X-Ax-Session" => member_session.session_token }
      expect(response).to have_http_status(:forbidden)
      expect(Organization.exists?(org.id)).to be true
    end

    it "deletes the organization and all associated data" do
      repo = create(:repo, organization: org)
      create(:pr, repo: repo, number: 1)
      create(:invite, organization: org)
      create(:team, organization: org, created_by: owner)

      delete "/api/v1/orgs/#{org.slug}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Organization.exists?(org.id)).to be false
      expect(Repo.exists?(repo.id)).to be false
    end

    it "removes org memberships" do
      member = create(:user)
      membership = create(:org_membership, organization: org, user: member, role: "member")

      delete "/api/v1/orgs/#{org.slug}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(OrgMembership.exists?(membership.id)).to be false
    end

    it "rejects deletion of personal organizations" do
      personal_org = create(:organization, is_personal: true, created_by: owner, slug: "personal-org", name: "Personal")
      create(:org_membership, organization: personal_org, user: owner, role: "owner")

      delete "/api/v1/orgs/#{personal_org.slug}", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      body = JSON.parse(response.body)
      expect(body["error"]).to include("personal")
      expect(Organization.exists?(personal_org.id)).to be true
    end

    it "rejects non-members" do
      outsider = create(:user)
      outsider_session = UserSession.create!(user: outsider, expires_at: 30.days.from_now)

      delete "/api/v1/orgs/#{org.slug}", headers: { "X-Ax-Session" => outsider_session.session_token }
      expect(response).to have_http_status(:forbidden)
    end
  end
end
