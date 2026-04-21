class ProcessedGithubEvent < ApplicationRecord
  validates :event_id, presence: true
end
