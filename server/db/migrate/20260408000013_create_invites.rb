class CreateInvites < ActiveRecord::Migration[8.1]
  def change
    create_table :invites do |t|
      t.references :organization, null: false, foreign_key: true
      t.string :github_username, null: false, index: true
      t.string :role, null: false
      t.references :invited_by, null: false, foreign_key: { to_table: :users }
      t.string :token, null: false, index: { unique: true }
      t.string :status, null: false, default: "pending"
      t.datetime :expires_at, null: false
      t.datetime :accepted_at
      t.timestamps
    end

    add_index :invites, [:organization_id, :github_username, :status], unique: true
  end
end
