class CreateProcessedGitlabEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :processed_gitlab_events do |t|
      t.string :event_id, null: false

      t.timestamps
    end

    add_index :processed_gitlab_events, :event_id, unique: true
  end
end
