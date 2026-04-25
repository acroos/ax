class User < ApplicationRecord
  devise :omniauthable, omniauth_providers: [ :github, :gitlab ]

  has_many :org_memberships, dependent: :destroy
  has_many :organizations, through: :org_memberships
  has_one  :api_key, -> { where(revoked: false) }, dependent: :destroy
  has_many :user_sessions, dependent: :destroy

  validates :github_id, uniqueness: true, allow_nil: true
  validates :gitlab_id, uniqueness: true, allow_nil: true
  validate :at_least_one_platform_identity

  # Returns the primary username for display and pushed_by attribution.
  def platform_username
    github_username || gitlab_username
  end

  # Returns all known platform usernames for query matching.
  def platform_usernames
    [ github_username, gitlab_username ].compact
  end

  private

  def at_least_one_platform_identity
    if github_id.blank? && gitlab_id.blank?
      errors.add(:base, "Must have at least one platform identity (GitHub or GitLab)")
    end
  end

  public

  def personal_org
    organizations.find_by(is_personal: true)
  end

  def member_of?(org)
    org_memberships.exists?(organization: org)
  end

  def role_in(org)
    org_memberships.find_by(organization: org)&.role
  end

  def admin_or_owner_of?(org)
    org_memberships.exists?(organization: org, role: %w[admin owner])
  end

  def teams_in(org)
    Team.joins(:team_memberships)
        .where(team_memberships: { org_membership_id: org_memberships.where(organization: org).select(:id) })
  end
end
