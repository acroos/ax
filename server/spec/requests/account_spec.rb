require "rails_helper"

RSpec.describe "Account API", type: :request do
  let(:user) { create(:user, github_username: "testuser") }
  let(:session) { UserSession.create!(user: user, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }

  describe "DELETE /api/v1/account" do
    it "requires session auth" do
      delete "/api/v1/account"
      expect(response).to have_http_status(:unauthorized)
    end

    it "deletes the user and their personal org" do
      personal_org = create(:organization, is_personal: true, created_by: user, slug: "testuser", name: "testuser")
      create(:org_membership, organization: personal_org, user: user, role: "owner")

      delete "/api/v1/account", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(User.exists?(user.id)).to be false
      expect(Organization.exists?(personal_org.id)).to be false
    end

    it "destroys user sessions and api keys" do
      ApiKey.generate_for(user)

      delete "/api/v1/account", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(UserSession.where(user_id: user.id)).to be_empty
      expect(ApiKey.where(user_id: user.id)).to be_empty
    end

    it "removes user from non-personal orgs" do
      org = create(:organization, is_personal: false, created_by: user)
      other_user = create(:user)
      create(:org_membership, organization: org, user: other_user, role: "owner")
      create(:org_membership, organization: org, user: user, role: "member")

      delete "/api/v1/account", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(OrgMembership.exists?(user_id: user.id)).to be false
      expect(Organization.exists?(org.id)).to be true
    end

    it "anonymizes authored PRs, commits, and sessions" do
      repo = create(:repo)
      pr = create(:pr, repo: repo, author: "testuser")
      commit = create(:commit, repo: repo, pr: pr, author: "testuser")
      coding_session = create(:coding_session, repo: repo, pushed_by: "testuser")

      delete "/api/v1/account", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(pr.reload.author).to eq("deleted-user")
      expect(commit.reload.author).to eq("deleted-user")
      expect(coding_session.reload.pushed_by).to eq("deleted-user")
    end

    it "blocks deletion when sole owner of a non-personal org" do
      org = create(:organization, is_personal: false, created_by: user, slug: "sole-org", name: "Sole Org")
      create(:org_membership, organization: org, user: user, role: "owner")

      delete "/api/v1/account", headers: headers

      expect(response).to have_http_status(:conflict)
      body = JSON.parse(response.body)
      expect(body["error"]).to include("sole owner")
      expect(body["organizations"].first["slug"]).to eq("sole-org")
      expect(User.exists?(user.id)).to be true
    end

    it "allows deletion when another owner exists" do
      org = create(:organization, is_personal: false, created_by: user, slug: "shared-org", name: "Shared Org")
      other_user = create(:user)
      create(:org_membership, organization: org, user: user, role: "owner")
      create(:org_membership, organization: org, user: other_user, role: "owner")

      delete "/api/v1/account", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(User.exists?(user.id)).to be false
      expect(Organization.exists?(org.id)).to be true
    end
  end
end
