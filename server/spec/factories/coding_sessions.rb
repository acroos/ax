FactoryBot.define do
  factory :coding_session do
    sequence(:id) { |n| "session-#{n}" }
    repo
    branch { "main" }
    message_count { 5 }
    turn_count { 3 }
    input_tokens { 1000 }
    output_tokens { 500 }
    cache_creation_input_tokens { 200 }
    cache_read_input_tokens { 800 }
    total_cost_usd { 0.10 }
    primary_model { "claude-sonnet-4-20250514" }
    assistant_message_count { 5 }
    sidechain_messages { 0 }
    total_file_reads { 10 }
    files_read_count { 8 }
    files_modified_count { 3 }
  end
end
