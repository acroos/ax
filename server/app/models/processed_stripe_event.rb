class ProcessedStripeEvent < ApplicationRecord
  validates :event_id, presence: true, uniqueness: true
end
