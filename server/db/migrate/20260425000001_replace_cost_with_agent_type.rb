class ReplaceCostWithAgentType < ActiveRecord::Migration[8.1]
  def up
    remove_column :sessions, :total_cost_usd, :float
    add_column :sessions, :agent_type, :string, null: false, default: "claude_code"
    change_column_null :sessions, :sidechain_messages, true
    change_column_default :sessions, :sidechain_messages, from: 0, to: nil
    add_index :sessions, [ :repo_id, :agent_type ]
  end

  def down
    remove_index :sessions, [ :repo_id, :agent_type ]
    change_column_default :sessions, :sidechain_messages, from: nil, to: 0
    execute "UPDATE sessions SET sidechain_messages = 0 WHERE sidechain_messages IS NULL"
    change_column_null :sessions, :sidechain_messages, false
    remove_column :sessions, :agent_type, :string
    add_column :sessions, :total_cost_usd, :float
  end
end
