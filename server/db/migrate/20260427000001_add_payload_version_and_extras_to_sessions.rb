class AddPayloadVersionAndExtrasToSessions < ActiveRecord::Migration[8.0]
  def change
    change_table :sessions do |t|
      t.integer :payload_version, default: 1, null: false
      t.jsonb :extras, default: {}, null: false
    end

    # Drop the agent_type default — push always sets it as of PR #232.
    # Guard with column_exists? for environments where Phase 1 migration state
    # may differ (shared dev DB with manually applied migrations).
    if column_exists?(:sessions, :agent_type)
      change_column_default :sessions, :agent_type, from: "claude_code", to: nil
    end
  end
end
