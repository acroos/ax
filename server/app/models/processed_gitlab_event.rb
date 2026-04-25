class ProcessedGitlabEvent < ApplicationRecord
  validates :event_id, presence: true, uniqueness: true
end
