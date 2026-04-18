require "rails_helper"

RSpec.describe Team, type: :model do
  let(:user) { create(:user) }
  let(:org) { create(:organization, created_by: user) }

  describe "slug validation" do
    it "accepts valid slugs" do
      team = build(:team, slug: "frontend", organization: org, created_by: user)
      expect(team).to be_valid
    end

    it "rejects slugs with uppercase" do
      team = build(:team, slug: "Frontend", organization: org, created_by: user)
      expect(team).not_to be_valid
    end

    it "rejects consecutive hyphens" do
      team = build(:team, slug: "front--end", organization: org, created_by: user)
      expect(team).not_to be_valid
    end

    it "rejects slugs shorter than 2 chars" do
      team = build(:team, slug: "a", organization: org, created_by: user)
      expect(team).not_to be_valid
    end

    it "enforces uniqueness within an org" do
      create(:team, slug: "frontend", organization: org, created_by: user)
      dupe = build(:team, slug: "frontend", organization: org, created_by: user)
      expect(dupe).not_to be_valid
    end

    it "allows same slug in different orgs" do
      other_org = create(:organization, created_by: user)
      create(:team, slug: "frontend", organization: org, created_by: user)
      team = build(:team, slug: "frontend", organization: other_org, created_by: user)
      expect(team).to be_valid
    end
  end

  describe "parent team validation" do
    it "rejects parent from a different org" do
      other_org = create(:organization, created_by: user)
      parent = create(:team, organization: other_org, created_by: user)
      team = build(:team, organization: org, parent_team: parent, created_by: user)
      expect(team).not_to be_valid
      expect(team.errors[:parent_team]).to include("must belong to the same organization")
    end

    it "accepts parent from the same org" do
      parent = create(:team, organization: org, created_by: user)
      team = build(:team, organization: org, parent_team: parent, created_by: user)
      expect(team).to be_valid
    end
  end

  describe "circular ancestry prevention" do
    it "rejects direct self-reference" do
      team = create(:team, organization: org, created_by: user)
      team.parent_team = team
      expect(team).not_to be_valid
      expect(team.errors[:parent_team]).to include("would create a circular hierarchy")
    end

    it "rejects indirect circular reference" do
      team_a = create(:team, slug: "team-aa", organization: org, created_by: user)
      team_b = create(:team, slug: "team-bb", organization: org, parent_team: team_a, created_by: user)
      team_a.parent_team = team_b
      expect(team_a).not_to be_valid
      expect(team_a.errors[:parent_team]).to include("would create a circular hierarchy")
    end
  end

  describe "#descendant_team_ids" do
    it "returns empty array for a team with no children" do
      team = create(:team, organization: org, created_by: user)
      expect(team.descendant_team_ids).to eq([])
    end

    it "returns direct child IDs" do
      parent = create(:team, slug: "parent", organization: org, created_by: user)
      child = create(:team, slug: "child", organization: org, parent_team: parent, created_by: user)
      expect(parent.descendant_team_ids).to contain_exactly(child.id)
    end

    it "returns deeply nested descendant IDs" do
      grandparent = create(:team, slug: "grandparent", organization: org, created_by: user)
      parent = create(:team, slug: "parent", organization: org, parent_team: grandparent, created_by: user)
      child = create(:team, slug: "child", organization: org, parent_team: parent, created_by: user)
      expect(grandparent.descendant_team_ids).to contain_exactly(parent.id, child.id)
    end
  end

  describe "#member_github_usernames" do
    it "returns usernames of direct members" do
      team = create(:team, organization: org, created_by: user)
      member = create(:user, github_username: "alice")
      membership = create(:org_membership, organization: org, user: member)
      create(:team_membership, team: team, org_membership: membership)

      expect(team.member_github_usernames).to contain_exactly("alice")
    end

    it "includes usernames from child teams" do
      parent = create(:team, slug: "parent", organization: org, created_by: user)
      child = create(:team, slug: "child", organization: org, parent_team: parent, created_by: user)

      alice = create(:user, github_username: "alice")
      bob = create(:user, github_username: "bob")
      alice_membership = create(:org_membership, organization: org, user: alice)
      bob_membership = create(:org_membership, organization: org, user: bob)

      create(:team_membership, team: parent, org_membership: alice_membership)
      create(:team_membership, team: child, org_membership: bob_membership)

      expect(parent.member_github_usernames).to contain_exactly("alice", "bob")
    end

    it "deduplicates usernames across teams" do
      parent = create(:team, slug: "parent", organization: org, created_by: user)
      child = create(:team, slug: "child", organization: org, parent_team: parent, created_by: user)

      alice = create(:user, github_username: "alice")
      membership = create(:org_membership, organization: org, user: alice)

      create(:team_membership, team: parent, org_membership: membership)
      create(:team_membership, team: child, org_membership: membership)

      expect(parent.member_github_usernames).to eq([ "alice" ])
    end
  end

  describe "cascade delete" do
    it "deletes child teams when parent is destroyed" do
      parent = create(:team, slug: "parent", organization: org, created_by: user)
      child = create(:team, slug: "child", organization: org, parent_team: parent, created_by: user)
      grandchild = create(:team, slug: "grandchild", organization: org, parent_team: child, created_by: user)

      parent.destroy!

      expect(Team.exists?(child.id)).to be false
      expect(Team.exists?(grandchild.id)).to be false
    end

    it "deletes team memberships when team is destroyed" do
      team = create(:team, organization: org, created_by: user)
      member = create(:user)
      membership = create(:org_membership, organization: org, user: member)
      tm = create(:team_membership, team: team, org_membership: membership)

      team.destroy!

      expect(TeamMembership.exists?(tm.id)).to be false
      expect(OrgMembership.exists?(membership.id)).to be true
    end
  end
end
