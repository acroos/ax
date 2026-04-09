class OrgMembership < ApplicationRecord
  belongs_to :organization
  belongs_to :user
  belongs_to :invited_by, class_name: "User", optional: true

  validates :role, inclusion: { in: %w[owner admin member] }
  validates :user_id, uniqueness: { scope: :organization_id }
end
