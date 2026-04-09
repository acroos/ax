class CreatePrMetrics < ActiveRecord::Migration[8.1]
  def change
    create_table :pr_metrics do |t|
      t.references :pr, null: false, foreign_key: true, index: { unique: true }
      t.integer :messages_per_pr
      t.integer :iteration_depth
      t.integer :post_open_commits
      t.boolean :first_pass_accepted
      t.float :ci_success_rate
      t.integer :diff_churn_lines
      t.boolean :has_tests
      t.float :line_revisit_rate
      t.float :plan_coverage_score
      t.float :plan_deviation_score
      t.boolean :scope_creep_detected
      t.float :self_correction_rate
      t.float :context_efficiency
      t.integer :error_recovery_attempts
      t.float :token_cost_usd
      t.boolean :metrics_finalized, default: false
      t.datetime :finalized_at
      t.datetime :computed_at, null: false, default: -> { "NOW()" }
      t.timestamps
    end
  end
end
