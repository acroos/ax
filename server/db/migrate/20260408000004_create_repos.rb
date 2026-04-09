class CreateRepos < ActiveRecord::Migration[8.1]
  def change
    create_table :repos do |t|
      t.string :path, null: false, index: { unique: true }
      t.string :remote_url
      t.string :github_owner
      t.string :github_repo
      t.datetime :last_synced_at
      t.references :organization, foreign_key: true
      t.timestamps
    end
  end
end
