class Subscription < ApplicationRecord
  belongs_to :organization

  validates :stripe_subscription_id, presence: true, uniqueness: true
  validates :status, presence: true

  scope :active, -> { where(status: "active") }
  scope :active_or_trialing, -> { where(status: %w[active trialing]) }

  def active?
    status == "active"
  end

  def will_cancel?
    cancel_at_period_end?
  end
end
