FactoryBot.define do
  factory :pr_metrics do
    pr
    post_open_commits { 1 }
    ci_success_rate { 1.0 }
    metrics_finalized { false }
  end
end
