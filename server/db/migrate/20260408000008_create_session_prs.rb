class CreateSessionPrs < ActiveRecord::Migration[8.1]
  def change
    create_table :session_prs do |t|
      t.string :session_id, null: false
      t.references :pr, null: false, foreign_key: true
      t.string :confidence, null: false
      t.timestamps
    end

    add_index :session_prs, [:session_id, :pr_id], unique: true
  end
end
