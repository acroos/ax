class Repo < ApplicationRecord
  has_many :prs, dependent: :destroy
  has_many :commits, dependent: :destroy
  has_many :coding_sessions, class_name: "CodingSession", dependent: :destroy
  has_one :watched_repo, dependent: :destroy
  belongs_to :organization, optional: true
  belongs_to :github_installation, optional: true

  validates :platform_owner, uniqueness: { scope: [ :organization_id, :platform, :platform_repo ] }, allow_nil: true

  belongs_to :gitlab_connection, optional: true
end
