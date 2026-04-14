FactoryBot.define do
  factory :session_pr do
    association :coding_session
    pr
    confidence { "branch_match" }
  end
end
