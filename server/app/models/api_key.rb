class ApiKey < ApplicationRecord
  belongs_to :user

  validates :key_hash, presence: true

  PREFIX = "ax_k1_"

  def self.generate_for(user)
    raw_key = "#{PREFIX}#{SecureRandom.hex(32)}"
    create!(
      user: user,
      key_hash: BCrypt::Password.create(raw_key),
      key_digest: digest(raw_key)
    )
    Rails.cache.write("api_key_reveal:#{user.id}", raw_key, expires_in: 1.hour)
    raw_key
  end

  def self.authenticate(raw_key)
    return nil unless raw_key&.start_with?(PREFIX)

    key = find_by(key_digest: digest(raw_key), revoked: false)

    # Fallback for keys created before the digest column was added
    key ||= bcrypt_fallback(raw_key)

    if key
      key.touch(:last_used_at)
      key
    end
  end

  def self.digest(raw_key)
    OpenSSL::Digest::SHA256.hexdigest(raw_key)
  end
  private_class_method :digest

  def self.bcrypt_fallback(raw_key)
    where(revoked: false, key_digest: nil).find_each do |key|
      if BCrypt::Password.new(key.key_hash) == raw_key
        key.update_columns(key_digest: digest(raw_key))
        return key
      end
    end
    nil
  end
  private_class_method :bcrypt_fallback
end
