FactoryBot.define do
  factory :coding_session do
    id { SecureRandom.uuid }
    association :repo
    branch { "main" }
    message_count { 5 }
    turn_count { 3 }
    input_tokens { 1000 }
    output_tokens { 500 }
    total_cost_usd { 0.05 }
    primary_model { "claude-sonnet-4-20250514" }
    bash_errors { 0 }
    bash_successes { 5 }
    files_read_count { 10 }
    files_modified_count { 3 }
  end
end
