class Invite < ApplicationRecord
  class MemberLimitReached < StandardError; end

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
      organization.lock!
      plan = PlanService.for(organization)
      current_count = organization.org_memberships.count

      unless plan.within_limit?(:max_members, current_count)
        # On Pro with an active subscription, auto-purchase a seat. The
        # Stripe call is wrapped in the same transaction so a failure rolls
        # back the membership creation and keeps billing in sync.
        if plan.plan_name == "pro" && organization.subscription&.active_or_trialing?
          SeatService.add_seat!(organization)
          plan = PlanService.for(organization.reload)
        end

        unless plan.within_limit?(:max_members, current_count)
          raise MemberLimitReached, "Organization has reached its member limit"
        end
      end

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
