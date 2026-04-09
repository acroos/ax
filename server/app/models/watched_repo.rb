class WatchedRepo < ApplicationRecord
  belongs_to :repo

  validates :repo_id, uniqueness: true

  scope :enabled, -> { where(enabled: true) }
end
