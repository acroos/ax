FactoryBot.define do
  factory :org_membership do
    organization
    user
    role { "member" }
  end
end
