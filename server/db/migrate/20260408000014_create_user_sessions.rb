class CreateUserSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :user_sessions do |t|
      t.string :session_token, null: false, index: { unique: true }
      t.references :user, null: false, foreign_key: true
      t.datetime :expires_at, null: false, index: true
      t.string :user_agent
      t.string :ip_address
      t.timestamps
    end
  end
end
