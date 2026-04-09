FactoryBot.define do
  factory :organization do
    sequence(:slug) { |n| "org#{n}" }
    sequence(:name) { |n| "Organization #{n}" }
    created_by { association(:user) }
  end
end
