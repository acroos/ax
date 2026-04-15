require "rails_helper"

RSpec.describe Organization, type: :model do
  describe "slug validation" do
    let(:user) { create(:user) }

    it "accepts valid slugs" do
      org = build(:organization, slug: "my-org", created_by: user)
      expect(org).to be_valid
    end

    it "rejects reserved slugs" do
      org = build(:organization, slug: "admin", created_by: user)
      expect(org).not_to be_valid
      expect(org.errors[:slug]).to include("is reserved")
    end

    it "rejects consecutive hyphens" do
      org = build(:organization, slug: "my--org", created_by: user)
      expect(org).not_to be_valid
    end

    it "rejects slugs starting with number" do
      org = build(:organization, slug: "1org", created_by: user)
      expect(org).not_to be_valid
    end

    it "rejects slugs shorter than 3 chars" do
      org = build(:organization, slug: "ab", created_by: user)
      expect(org).not_to be_valid
    end
  end

  describe "#enforce_free_plan_limits!" do
    let(:owner) { create(:user) }
    let(:org) { create(:organization, created_by: owner) }

    before do
      create(:org_membership, organization: org, user: owner, role: "owner")
    end

    it "removes all non-owner memberships" do
      member = create(:user)
      admin = create(:user)
      create(:org_membership, organization: org, user: member, role: "member")
      create(:org_membership, organization: org, user: admin, role: "admin")

      org.enforce_free_plan_limits!

      expect(org.org_memberships.reload.map(&:role)).to eq([ "owner" ])
    end

    it "destroys all invites" do
      create(:invite, organization: org, invited_by: owner)
      create(:invite, organization: org, invited_by: owner, github_username: "invitee2")

      org.enforce_free_plan_limits!

      expect(org.invites.reload).to be_empty
    end

    it "invalidates sessions for removed users" do
      member = create(:user)
      create(:org_membership, organization: org, user: member, role: "member")
      session = UserSession.create!(user: member, expires_at: 30.days.from_now)

      org.enforce_free_plan_limits!

      expect(UserSession.find_by(id: session.id)).to be_nil
    end

    it "does not invalidate sessions for owners" do
      owner_session = UserSession.create!(user: owner, expires_at: 30.days.from_now)

      org.enforce_free_plan_limits!

      expect(UserSession.find_by(id: owner_session.id)).to be_present
    end

    it "is a no-op when there are no non-owner memberships" do
      expect { org.enforce_free_plan_limits! }.not_to raise_error
      expect(org.org_memberships.reload.count).to eq(1)
    end
  end
end
