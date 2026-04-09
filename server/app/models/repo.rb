class Repo < ApplicationRecord
  has_many :prs, dependent: :destroy
  has_many :commits, dependent: :destroy
  has_many :coding_sessions, class_name: "CodingSession", dependent: :destroy
  has_many :repo_metrics, class_name: "RepoMetrics", dependent: :destroy
  has_one :watched_repo, dependent: :destroy
  belongs_to :organization, optional: true

  validates :path, presence: true, uniqueness: true
end
