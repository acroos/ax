FactoryBot.define do
  factory :subscription do
    organization
    sequence(:stripe_subscription_id) { |n| "sub_test_#{n}" }
    status { "active" }
    current_period_start { Time.current }
    current_period_end { 1.month.from_now }
    cancel_at_period_end { false }
  end
end
