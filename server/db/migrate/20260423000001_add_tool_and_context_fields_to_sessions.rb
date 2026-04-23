class AddToolAndContextFieldsToSessions < ActiveRecord::Migration[8.1]
  def change
    add_column :sessions, :peak_context_pct, :float
    add_column :sessions, :total_tool_calls, :integer, default: 0, null: false
    add_column :sessions, :agent_tool_calls, :integer, default: 0, null: false
    add_column :sessions, :skill_tool_calls, :integer, default: 0, null: false
    add_column :sessions, :mcp_tool_calls, :integer, default: 0, null: false
  end
end
