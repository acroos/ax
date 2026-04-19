require "rails_helper"

RSpec.describe TeamMembership, type: :model do
  let(:user) { create(:user) }
  let(:org) { create(:organization, created_by: user) }

  describe "org match validation" do
    it "rejects memberships where org_membership is from a different org" do
      other_org = create(:organization, created_by: user)
      team = create(:team, organization: org, created_by: user)
      membership = create(:org_membership, organization: other_org, user: create(:user))
      tm = build(:team_membership, team: team, org_membership: membership)
      expect(tm).not_to be_valid
      expect(tm.errors[:org_membership]).to include("must belong to the same organization as the team")
    end

    it "accepts memberships where org_membership matches team org" do
      team = create(:team, organization: org, created_by: user)
      membership = create(:org_membership, organization: org, user: create(:user))
      tm = build(:team_membership, team: team, org_membership: membership)
      expect(tm).to be_valid
    end
  end

  describe "uniqueness" do
    it "prevents duplicate team memberships" do
      team = create(:team, organization: org, created_by: user)
      membership = create(:org_membership, organization: org, user: create(:user))
      create(:team_membership, team: team, org_membership: membership)
      dupe = build(:team_membership, team: team, org_membership: membership)
      expect(dupe).not_to be_valid
    end
  end

  describe "cascade on org_membership destroy" do
    it "deletes team membership when org membership is destroyed" do
      team = create(:team, organization: org, created_by: user)
      member = create(:user)
      membership = create(:org_membership, organization: org, user: member)
      tm = create(:team_membership, team: team, org_membership: membership)

      membership.destroy!

      expect(TeamMembership.exists?(tm.id)).to be false
    end
  end
end
