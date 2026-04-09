class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.bigint  :github_id, null: false, index: { unique: true }
      t.string  :github_username, null: false
      t.string  :email
      t.string  :display_name
      t.string  :avatar_url
      t.datetime :last_login_at, null: false, default: -> { "NOW()" }
      t.timestamps
    end
  end
end
