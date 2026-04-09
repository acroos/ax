class CreateWatchedRepos < ActiveRecord::Migration[8.1]
  def change
    create_table :watched_repos do |t|
      t.references :repo, null: false, foreign_key: true, index: { unique: true }
      t.integer :poll_interval_seconds, default: 300
      t.datetime :last_polled_at
      t.boolean :enabled, default: true
      t.timestamps
    end
  end
end
