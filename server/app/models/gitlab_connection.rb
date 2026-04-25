class GitlabConnection < ApplicationRecord
  belongs_to :organization
  belongs_to :connected_by, class_name: "User"
  has_many :repos, dependent: :nullify

  encrypts :access_token_ciphertext
  encrypts :refresh_token_ciphertext

  validates :gitlab_user_id, presence: true
  validates :account_username, presence: true
  validates :webhook_secret, presence: true
  validates :organization_id, uniqueness: true

  def active?
    status == "active"
  end
end
