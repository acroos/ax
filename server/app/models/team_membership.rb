class TeamMembership < ApplicationRecord
  belongs_to :team
  belongs_to :org_membership
  has_one :user, through: :org_membership

  validates :org_membership_id, uniqueness: { scope: :team_id }
  validate :org_membership_matches_team_org

  private

  def org_membership_matches_team_org
    return unless team && org_membership
    unless org_membership.organization_id == team.organization_id
      errors.add(:org_membership, "must belong to the same organization as the team")
    end
  end
end
