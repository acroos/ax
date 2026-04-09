class UserSession < ApplicationRecord
  belongs_to :user

  validates :session_token, presence: true, uniqueness: true
  validates :expires_at, presence: true

  scope :active, -> { where("expires_at > ?", Time.current) }

  before_validation :generate_token, on: :create

  def expired?
    expires_at < Time.current
  end

  def self.create_for(user, request)
    create!(
      user: user,
      expires_at: 30.days.from_now,
      user_agent: request.user_agent,
      ip_address: request.remote_ip
    )
  end

  private

  def generate_token
    self.session_token ||= SecureRandom.hex(32)
  end
end
