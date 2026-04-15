PLANS = {
  "free" => {
    max_members: 1,
    max_repos: 2,
    core_metrics: true,
    github_integration: true,
    compare_developers: false,
    export_data: false,
    priority_support: false
  }.freeze,
  "pro" => {
    max_members: Float::INFINITY,
    max_repos: Float::INFINITY,
    core_metrics: true,
    github_integration: true,
    compare_developers: true,
    export_data: true,
    priority_support: true
  }.freeze
}.freeze
