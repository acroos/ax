class User < ApplicationRecord
  devise :omniauthable, omniauth_providers: [ :github ]

  has_many :org_memberships, dependent: :destroy
  has_many :organizations, through: :org_memberships
  has_one  :api_key, -> { where(revoked: false) }, dependent: :destroy
  has_many :user_sessions, dependent: :destroy

  validates :github_id, presence: true, uniqueness: true
  validates :github_username, presence: true

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
end
