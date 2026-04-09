FactoryBot.define do
  factory :pr do
    repo
    sequence(:number) { |n| n }
    title { "PR ##{number}" }
    branch { "feature/#{number}" }
    state { "open" }
  end
end
