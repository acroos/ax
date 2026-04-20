class DropRepoMetrics < ActiveRecord::Migration[8.0]
  def up
    drop_table :repo_metrics
  end

  def down
    create_table :repo_metrics do |t|
      t.references :repo, null: false, foreign_key: true
      t.date :period_start, null: false
      t.date :period_end, null: false
      t.string :period_type, null: false, default: "weekly"
      t.integer :total_sessions, default: 0
      t.integer :total_tokens, default: 0
      t.float :total_cost_usd, default: 0.0
      t.integer :unmerged_tokens, default: 0
      t.float :unmerged_cost_usd, default: 0.0
      t.float :unmerged_rate
      t.datetime :computed_at
      t.timestamps
    end

    add_index :repo_metrics, [:repo_id, :period_type, :period_start], unique: true
  end
end
