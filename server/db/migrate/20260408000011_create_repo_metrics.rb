class CreateRepoMetrics < ActiveRecord::Migration[8.1]
  def change
    create_table :repo_metrics do |t|
      t.references :repo, null: false, foreign_key: true
      t.string :period_start, null: false
      t.string :period_end, null: false
      t.string :period_type, null: false
      t.integer :total_sessions, default: 0
      t.integer :total_tokens, default: 0
      t.float :total_cost_usd, default: 0
      t.integer :unmerged_tokens, default: 0
      t.float :unmerged_cost_usd, default: 0
      t.float :unmerged_rate
      t.datetime :computed_at, null: false, default: -> { "NOW()" }
      t.timestamps
    end

    add_index :repo_metrics, [ :repo_id, :period_start, :period_type ], unique: true
  end
end
