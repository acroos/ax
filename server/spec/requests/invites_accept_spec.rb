require "rails_helper"

RSpec.describe "Invites accept API", type: :request do
  let(:user) { create(:user) }
  let(:session) { UserSession.create!(user: user, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }

  let(:inviter) { create(:user) }
  let(:organization) { create(:organization, created_by: inviter) }
  before { create(:org_membership, organization: organization, user: inviter, role: "owner") }

  def accept_path(token)
    "/api/v1/invites/#{token}/accept"
  end

  it "requires session auth" do
    invite = create(:invite, organization: organization, invited_by: inviter)
    post accept_path(invite.token)
    expect(response).to have_http_status(:unauthorized)
  end

  it "accepts a valid pending invite and returns the org slug" do
    organization.update!(plan: "pro")
    invite = create(:invite, organization: organization, invited_by: inviter, github_username: user.github_username)
    post accept_path(invite.token), headers: headers

    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)).to include("org_slug" => organization.slug)
    expect(user.reload.member_of?(organization)).to be true
    expect(invite.reload.status).to eq("accepted")
  end

  it "returns 404 for a non-existent token" do
    post accept_path("bogus"), headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "returns 404 for a revoked invite" do
    invite = create(:invite, organization: organization, invited_by: inviter, status: "revoked")
    post accept_path(invite.token), headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "returns 403 when org has reached its member limit" do
    # Free plan: max_members is 1, owner already takes that slot
    invite = create(:invite, organization: organization, invited_by: inviter, github_username: user.github_username)

    expect {
      post accept_path(invite.token), headers: headers
    }.not_to change { OrgMembership.count }

    expect(response).to have_http_status(:forbidden)
    body = JSON.parse(response.body)
    expect(body["error"]).to include("member limit")
    expect(invite.reload.status).to eq("pending")
  end

  it "allows invite acceptance when org is on pro plan" do
    organization.update!(plan: "pro")
    invite = create(:invite, organization: organization, invited_by: inviter, github_username: user.github_username)

    post accept_path(invite.token), headers: headers

    expect(response).to have_http_status(:ok)
    expect(user.reload.member_of?(organization)).to be true
  end

  it "returns 403 when the invite is for a different GitHub user" do
    invite = create(:invite, organization: organization, invited_by: inviter, github_username: "someone-else")

    expect {
      post accept_path(invite.token), headers: headers
    }.not_to change { OrgMembership.count }

    expect(response).to have_http_status(:forbidden)
    body = JSON.parse(response.body)
    expect(body["error"]).to include("different GitHub user")
    expect(invite.reload.status).to eq("pending")
  end

  it "returns already_member without creating a duplicate membership if the user is already in the org" do
    invite = create(:invite, organization: organization, invited_by: inviter)
    create(:org_membership, organization: organization, user: user, role: "member")

    expect {
      post accept_path(invite.token), headers: headers
    }.not_to change { OrgMembership.count }

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body).to include("org_slug" => organization.slug, "already_member" => true)
  end
end
