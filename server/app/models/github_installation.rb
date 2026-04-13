class GithubInstallation < ApplicationRecord
  belongs_to :organization, optional: true
  belongs_to :installed_by, class_name: "User", optional: true
  has_many :repos, dependent: :nullify

  enum :status, { active: "active", suspended: "suspended", deleted: "deleted" }

  validates :github_installation_id, presence: true, uniqueness: true
  validates :account_login, :account_type, :target_type, :repository_selection, presence: true
end
