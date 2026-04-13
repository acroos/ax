class ApiKey < ApplicationRecord
  belongs_to :user

  validates :key_hash, presence: true

  PREFIX = "ax_k1_"

  def self.generate_for(user)
    raw_key = "#{PREFIX}#{SecureRandom.hex(32)}"
    create!(user: user, key_hash: BCrypt::Password.create(raw_key))
    Rails.cache.write("api_key_reveal:#{user.id}", raw_key, expires_in: 1.hour)
    raw_key
  end

  def self.authenticate(raw_key)
    return nil unless raw_key&.start_with?(PREFIX)

    where(revoked: false).find_each do |key|
      if BCrypt::Password.new(key.key_hash) == raw_key
        key.touch(:last_used_at)
        return key
      end
    end

    nil
  end
end
