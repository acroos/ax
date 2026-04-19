class CreateTeamMemberships < ActiveRecord::Migration[8.0]
  def change
    create_table :team_memberships do |t|
      t.references :team, null: false, foreign_key: true
      t.references :org_membership, null: false, foreign_key: true
      t.timestamps
    end

    add_index :team_memberships, [ :team_id, :org_membership_id ], unique: true
  end
end
