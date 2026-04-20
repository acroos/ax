FactoryBot.define do
  factory :api_key do
    user
    transient do
      raw { "ax_k1_#{SecureRandom.hex(32)}" }
    end
    key_hash { BCrypt::Password.create(raw) }
    key_digest { OpenSSL::Digest::SHA256.hexdigest(raw) }
  end
end
