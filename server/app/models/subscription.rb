class Subscription < ApplicationRecord
  belongs_to :organization

  validates :stripe_subscription_id, presence: true, uniqueness: true
  validates :status, presence: true
  validates :quantity, numericality: { only_integer: true, greater_than_or_equal_to: 1 }

  scope :active, -> { where(status: "active") }
  scope :active_or_trialing, -> { where(status: %w[active trialing]) }

  def active?
    status == "active"
  end

  def active_or_trialing?
    status.in?(%w[active trialing])
  end

  def will_cancel?
    cancel_at_period_end?
  end
end
