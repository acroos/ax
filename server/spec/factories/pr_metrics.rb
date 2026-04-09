FactoryBot.define do
  factory :pr_metrics do
    pr
    messages_per_pr { 5 }
    iteration_depth { 2 }
    post_open_commits { 1 }
    first_pass_accepted { true }
    ci_success_rate { 1.0 }
    token_cost_usd { 0.50 }
    metrics_finalized { false }
  end
end
