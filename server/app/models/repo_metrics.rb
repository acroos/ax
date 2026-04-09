class RepoMetrics < ApplicationRecord
  belongs_to :repo

  validates :period_start, presence: true
  validates :period_end, presence: true
  validates :period_type, presence: true
  validates :period_start, uniqueness: { scope: [:repo_id, :period_type] }
end
