class ReplaceCostWithAgentType < ActiveRecord::Migration[8.1]
  def change
    remove_column :sessions, :total_cost_usd, :float
    add_column :sessions, :agent_type, :string, null: false, default: "claude_code"
    add_index :sessions, [ :repo_id, :agent_type ]
  end
end
