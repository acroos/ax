FactoryBot.define do
  factory :api_key do
    user
    key_hash { BCrypt::Password.create("ax_k1_#{SecureRandom.hex(32)}") }
  end
end
