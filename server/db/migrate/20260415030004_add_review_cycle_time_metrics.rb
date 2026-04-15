class AddReviewCycleTimeMetrics < ActiveRecord::Migration[8.1]
  def change
    add_column :pr_metrics, :first_review_at, :datetime, default: nil
    add_column :pr_metrics, :review_cycle_time_minutes, :integer, default: nil
  end
end
