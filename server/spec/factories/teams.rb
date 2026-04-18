FactoryBot.define do
  factory :team do
    organization
    sequence(:name) { |n| "Team #{n}" }
    sequence(:slug) { |n| "team-#{n}" }
    created_by { association(:user) }
  end
end
