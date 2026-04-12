class CreatePrFiles < ActiveRecord::Migration[8.1]
  def change
    create_table :pr_files do |t|
      t.references :pr, null: false, foreign_key: true
      t.string :filename, null: false
      t.integer :additions, default: 0
      t.integer :deletions, default: 0
      t.integer :line_changes, default: 0
      t.string :status

      t.timestamps
    end

    add_index :pr_files, [:pr_id, :filename], unique: true
  end
end
