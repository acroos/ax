class CreateGitlabConnections < ActiveRecord::Migration[8.1]
  def change
    create_table :gitlab_connections do |t|
      t.references :organization, null: false, foreign_key: true
      t.bigint :gitlab_user_id, null: false
      t.string :account_username, null: false
      t.string :access_token_ciphertext
      t.string :refresh_token_ciphertext
      t.datetime :token_expires_at
      t.string :token_scopes
      t.string :webhook_secret, null: false
      t.references :connected_by, null: false, foreign_key: { to_table: :users }
      t.datetime :connected_at
      t.datetime :last_synced_at
      t.string :status, default: "active", null: false

      t.timestamps
    end

    add_index :gitlab_connections, :organization_id, unique: true, name: "index_gitlab_connections_on_organization_id_unique"

    # Add FK from repos to gitlab_connections (could not be in migration 1 — table didn't exist yet)
    add_reference :repos, :gitlab_connection, foreign_key: true, null: true
  end
end
