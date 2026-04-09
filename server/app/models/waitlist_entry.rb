class WaitlistEntry < ApplicationRecord
  validates :email, presence: true
  validates :status, inclusion: { in: %w[waiting approved joined] }
end
