FactoryBot.define do
  factory :user do
    sequence(:github_id) { |n| 10000 + n }
    sequence(:github_username) { |n| "user#{n}" }
    email { "#{github_username}@example.com" }
    display_name { github_username.capitalize }
  end
end
