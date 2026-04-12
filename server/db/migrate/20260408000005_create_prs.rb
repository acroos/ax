class CreatePrs < ActiveRecord::Migration[8.1]
  def change
    create_table :prs do |t|
      t.references :repo, null: false, foreign_key: true
      t.integer :number, null: false
      t.string :title
      t.string :branch
      t.string :state
      t.string :previous_state
      t.string :created_at_source
      t.string :merged_at
      t.string :closed_at
      t.string :url
      t.integer :additions, default: 0
      t.integer :deletions, default: 0
      t.integer :changed_files, default: 0
      t.string :pushed_by
      t.string :author
      t.integer :open_commit_count
      t.timestamps
    end

    add_index :prs, [ :repo_id, :number ], unique: true
  end
end
