class CreateOrgMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :org_memberships do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :role, null: false
      t.references :invited_by, foreign_key: { to_table: :users }
      t.datetime :joined_at, null: false, default: -> { "NOW()" }
      t.timestamps
    end

    add_index :org_memberships, [ :organization_id, :user_id ], unique: true
  end
end
