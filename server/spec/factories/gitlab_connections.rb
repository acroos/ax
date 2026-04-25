FactoryBot.define do
  factory :gitlab_connection do
    organization
    connected_by factory: :user
    sequence(:gitlab_user_id) { |n| 20000 + n }
    sequence(:account_username) { |n| "gitlab_user#{n}" }
    access_token_ciphertext { "test_token_#{SecureRandom.hex(8)}" }
    refresh_token_ciphertext { "test_refresh_#{SecureRandom.hex(8)}" }
    token_expires_at { 2.hours.from_now }
    token_scopes { "api read_user" }
    webhook_secret { SecureRandom.hex(20) }
    connected_at { Time.current }
    status { "active" }
  end
end
