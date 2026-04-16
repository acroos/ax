FactoryBot.define do
  factory :pr_metrics do
    pr
    iteration_depth { 2 }
    post_open_commits { 1 }
    ci_success_rate { 1.0 }
    token_cost_usd { 0.50 }
    metrics_finalized { false }
  end
end
