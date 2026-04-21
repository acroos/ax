class CreateProcessedGithubEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :processed_github_events do |t|
      t.string :event_id, null: false, index: { unique: true }
      t.timestamps
    end
  end
end
