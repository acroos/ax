class GithubInstallation < ApplicationRecord
  STATUSES = %w[active suspended deleted].freeze

  belongs_to :organization
  belongs_to :installed_by, class_name: "User", optional: true
  has_many :repos, dependent: :nullify

  validates :github_installation_id, presence: true, uniqueness: true
  validates :account_login, :account_type, :target_type, :repository_selection, presence: true
  validates :status, inclusion: { in: STATUSES }

  scope :active, -> { where(status: "active") }

  def active?
    status == "active"
  end

  def suspended?
    status == "suspended"
  end

  def deleted?
    status == "deleted"
  end
end
