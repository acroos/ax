FactoryBot.define do
  factory :repo do
    sequence(:path) { |n| "/home/user/project#{n}" }
    sequence(:github_owner) { |n| "owner#{n}" }
    sequence(:github_repo) { |n| "repo#{n}" }
    organization
  end
end
