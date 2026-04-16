class RemoveDeprecatedMetrics < ActiveRecord::Migration[8.1]
  def change
    drop_table :plan_analyses do |t|
      t.references :pr, foreign_key: true
      t.string :plan_file
      t.float :coverage_score
      t.float :deviation_score
      t.boolean :scope_creep_detected, default: false
      t.text :planned_files
      t.text :actual_files
      t.text :analysis_json
      t.timestamps
    end

    remove_column :pr_metrics, :messages_per_pr, :integer
    remove_column :pr_metrics, :first_pass_accepted, :boolean
    remove_column :pr_metrics, :diff_churn_lines, :integer
    remove_column :pr_metrics, :has_tests, :boolean
    remove_column :pr_metrics, :plan_coverage_score, :float
    remove_column :pr_metrics, :plan_deviation_score, :float
    remove_column :pr_metrics, :scope_creep_detected, :boolean
    remove_column :pr_metrics, :self_correction_rate, :float
    remove_column :pr_metrics, :context_efficiency, :float
    remove_column :pr_metrics, :error_recovery_attempts, :integer

    remove_column :sessions, :bash_errors, :integer, default: 0
    remove_column :sessions, :bash_successes, :integer, default: 0
    remove_column :sessions, :planned_files, :text
  end
end
