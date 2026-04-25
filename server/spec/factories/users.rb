FactoryBot.define do
  factory :user do
    sequence(:github_id) { |n| 10000 + n }
    sequence(:github_username) { |n| "user#{n}" }
    email { "#{github_username}@example.com" }
    display_name { github_username.capitalize }

    trait :gitlab do
      github_id { nil }
      github_username { nil }
      sequence(:gitlab_id) { |n| 20000 + n }
      sequence(:gitlab_username) { |n| "gluser#{n}" }
      email { "#{gitlab_username}@example.com" }
      display_name { gitlab_username.capitalize }
    end

    trait :dual_platform do
      sequence(:gitlab_id) { |n| 20000 + n }
      sequence(:gitlab_username) { |n| "gluser#{n}" }
    end
  end
end
