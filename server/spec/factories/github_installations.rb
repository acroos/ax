FactoryBot.define do
  factory :github_installation do
    organization
    sequence(:github_installation_id) { |n| 1_000_000 + n }
    sequence(:account_login) { |n| "acct#{n}" }
    account_type { "Organization" }
    target_type { "Organization" }
    repository_selection { "all" }
    status { "active" }
    installed_at { Time.current }
    permissions { { "contents" => "read", "metadata" => "read", "pull_requests" => "read", "checks" => "read" } }
    events { %w[pull_request pull_request_review check_suite installation installation_repositories] }
  end
end
