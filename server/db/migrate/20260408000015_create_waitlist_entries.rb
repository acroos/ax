class CreateWaitlistEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :waitlist_entries do |t|
      t.string :email, null: false, index: true
      t.string :github_username, index: true
      t.string :status, null: false, default: "waiting"
      t.datetime :approved_at
      t.timestamps
    end
  end
end
