class AddAgentBehaviorFieldsToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column :sessions, :bash_errors, :integer, default: 0
    add_column :sessions, :bash_successes, :integer, default: 0
    add_column :sessions, :files_read_count, :integer, default: 0
    add_column :sessions, :files_modified_count, :integer, default: 0
  end
end
