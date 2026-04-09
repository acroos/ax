class CreateCommits < ActiveRecord::Migration[8.1]
  def change
    create_table :commits, id: false do |t|
      t.string :sha, primary_key: true
      t.references :repo, null: false, foreign_key: true
      t.references :pr, foreign_key: true
      t.string :session_id
      t.string :message
      t.string :author
      t.string :committed_at
      t.boolean :is_claude_authored, default: false
      t.boolean :is_post_open, default: false
      t.integer :additions, default: 0
      t.integer :deletions, default: 0
      t.integer :files_changed, default: 0
      t.timestamps
    end

    add_index :commits, :session_id
  end
end
