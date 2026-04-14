FactoryBot.define do
  factory :session_pr do
    association :coding_session
    association :pr
    confidence { "branch_match" }
  end
end
