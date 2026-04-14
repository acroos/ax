class AddNewMetricFields < ActiveRecord::Migration[8.0]
  def change
    # Session-level aggregates for new metrics
    add_column :sessions, :assistant_message_count, :integer, default: 0, null: false
    add_column :sessions, :sidechain_messages, :integer, default: 0, null: false
    add_column :sessions, :total_file_reads, :integer, default: 0, null: false

    # PR-level computed metrics
    add_column :pr_metrics, :cache_hit_rate, :float
    add_column :pr_metrics, :sidechain_rate, :float
    add_column :pr_metrics, :re_read_rate, :float
    add_column :pr_metrics, :autonomy_score, :float
  end
end
