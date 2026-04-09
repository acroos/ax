class Invite < ApplicationRecord
  belongs_to :organization
  belongs_to :invited_by, class_name: "User"

  validates :github_username, presence: true
  validates :role, inclusion: { in: %w[admin member] }
  validates :token, presence: true, uniqueness: true
  validates :status, inclusion: { in: %w[pending accepted expired revoked] }

  scope :pending, -> { where(status: "pending").where("expires_at > ?", Time.current) }

  before_validation :generate_token, on: :create
  before_validation :set_expiry, on: :create

  def accept!(user)
    transaction do
      update!(status: "accepted", accepted_at: Time.current)
      OrgMembership.create!(
        organization: organization,
        user: user,
        role: role,
        invited_by: invited_by
      )
    end
  end

  def expired?
    expires_at < Time.current
  end

  private

  def generate_token
    self.token ||= SecureRandom.hex(32)
  end

  def set_expiry
    self.expires_at ||= 7.days.from_now
  end
end
