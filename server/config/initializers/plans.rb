PLANS = {
  "free" => {
    max_members: 1,
    max_repos: 2,
    history_days: 30,
    core_metrics: true,
    github_integration: true,
    export_data: false,
    priority_support: false,
    teams: false
  }.freeze,
  "pro" => {
    max_members: Float::INFINITY,
    max_repos: Float::INFINITY,
    history_days: Float::INFINITY,
    core_metrics: true,
    github_integration: true,
    export_data: true,
    priority_support: true,
    teams: true
  }.freeze
}.freeze
