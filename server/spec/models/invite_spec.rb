require "rails_helper"

RSpec.describe Invite, type: :model do
  let(:inviter) { create(:user) }
  let(:org) { create(:organization, created_by: inviter) }

  before do
    create(:org_membership, organization: org, user: inviter, role: "owner")
  end

  describe "#accept!" do
    it "creates membership and marks invite as accepted" do
      org.update!(plan: "pro")
      invite = Invite.create!(
        organization: org,
        github_username: "newuser",
        role: "member",
        invited_by: inviter
      )

      new_user = create(:user, github_username: "newuser")
      invite.accept!(new_user)

      expect(invite.reload.status).to eq("accepted")
      expect(invite.accepted_at).to be_present
      expect(new_user.member_of?(org)).to be true
      expect(new_user.role_in(org)).to eq("member")
    end

    it "raises MemberLimitReached when org is at its member limit" do
      # Free plan has max_members: 1, and the owner already counts as 1
      invite = Invite.create!(
        organization: org,
        github_username: "newuser",
        role: "member",
        invited_by: inviter
      )

      new_user = create(:user, github_username: "newuser")
      expect { invite.accept!(new_user) }.to raise_error(Invite::MemberLimitReached)
      expect(invite.reload.status).to eq("pending")
      expect(new_user.member_of?(org)).to be false
    end

    it "allows acceptance when org is on a pro plan" do
      org.update!(plan: "pro")
      invite = Invite.create!(
        organization: org,
        github_username: "newuser",
        role: "member",
        invited_by: inviter
      )

      new_user = create(:user, github_username: "newuser")
      invite.accept!(new_user)

      expect(invite.reload.status).to eq("accepted")
      expect(new_user.member_of?(org)).to be true
    end
  end

  describe "token generation" do
    it "auto-generates a token" do
      invite = Invite.create!(
        organization: org,
        github_username: "someone",
        role: "admin",
        invited_by: inviter
      )

      expect(invite.token).to be_present
      expect(invite.token.length).to eq(64)
    end
  end

  describe "expiry" do
    it "auto-sets expiry to 7 days" do
      invite = Invite.create!(
        organization: org,
        github_username: "someone",
        role: "member",
        invited_by: inviter
      )

      expect(invite.expires_at).to be_within(1.minute).of(7.days.from_now)
    end

    it "excludes expired invites from pending scope" do
      expired = Invite.create!(
        organization: org,
        github_username: "expired",
        role: "member",
        invited_by: inviter,
        expires_at: 1.day.ago
      )

      expect(Invite.pending).not_to include(expired)
    end
  end
end
