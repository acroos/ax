FactoryBot.define do
  factory :repo do
    sequence(:path) { |n| "/home/user/project#{n}" }
    sequence(:platform_owner) { |n| "owner#{n}" }
    sequence(:platform_repo) { |n| "repo#{n}" }
    organization
  end
end
