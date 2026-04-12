class CreateGithubInstallations < ActiveRecord::Migration[8.1]
  def change
    create_table :github_installations do |t|
      t.references :organization, null: false, foreign_key: true
      t.bigint :github_installation_id, null: false, index: { unique: true }
      t.string :account_login, null: false
      t.string :account_type, null: false
      t.string :target_type, null: false
      t.string :repository_selection, null: false
      t.string :webhook_secret
      t.string :status, null: false, default: "active"
      t.datetime :installed_at
      t.datetime :last_synced_at
      t.references :installed_by, foreign_key: { to_table: :users }
      t.jsonb :permissions, null: false, default: {}
      t.jsonb :events, null: false, default: []
      t.timestamps
    end

    add_index :github_installations, :status
  end
end
