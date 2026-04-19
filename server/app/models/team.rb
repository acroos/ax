class Team < ApplicationRecord
  belongs_to :organization
  belongs_to :parent_team, class_name: "Team", optional: true
  belongs_to :created_by, class_name: "User"

  has_many :child_teams, class_name: "Team", foreign_key: :parent_team_id, dependent: :destroy
  has_many :team_memberships, dependent: :destroy
  has_many :org_memberships, through: :team_memberships
  has_many :users, through: :org_memberships

  validates :name, presence: true
  validates :slug, presence: true,
            uniqueness: { scope: :organization_id },
            format: { with: /\A[a-z][a-z0-9-]*[a-z0-9]\z/, message: "must be lowercase alphanumeric with hyphens" },
            length: { in: 2..40 }
  validate :parent_belongs_to_same_org
  validate :no_circular_ancestry
  validate :no_consecutive_hyphens

  # All descendant team IDs via recursive CTE (PostgreSQL).
  def descendant_team_ids
    return [] unless persisted?

    sql = <<~SQL
      WITH RECURSIVE team_tree AS (
        SELECT id FROM teams WHERE parent_team_id = :id
        UNION ALL
        SELECT t.id FROM teams t
        INNER JOIN team_tree tt ON t.parent_team_id = tt.id
      )
      SELECT id FROM team_tree
    SQL
    Team.find_by_sql([ sql, { id: id } ]).map(&:id)
  end

  # GitHub usernames for this team + all descendants (for PR author matching).
  def member_github_usernames
    all_ids = [ id ] + descendant_team_ids
    TeamMembership
      .where(team_id: all_ids)
      .joins(org_membership: :user)
      .pluck("users.github_username")
      .uniq
  end

  def direct_member_count
    team_memberships.count
  end

  private

  def parent_belongs_to_same_org
    return unless parent_team
    unless parent_team.organization_id == organization_id
      errors.add(:parent_team, "must belong to the same organization")
    end
  end

  def no_circular_ancestry
    return unless parent_team_id

    visited = Set.new([ id ])
    current = parent_team
    while current
      if visited.include?(current.id)
        errors.add(:parent_team, "would create a circular hierarchy")
        return
      end
      visited << current.id
      current = current.parent_team
    end
  end

  def no_consecutive_hyphens
    errors.add(:slug, "cannot contain consecutive hyphens") if slug&.include?("--")
  end
end
