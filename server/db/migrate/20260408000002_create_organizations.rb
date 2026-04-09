class CreateOrganizations < ActiveRecord::Migration[8.1]
  def change
    create_table :organizations do |t|
      t.string  :slug, null: false, index: { unique: true }
      t.string  :name, null: false
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.boolean :is_personal, null: false, default: false
      t.timestamps
    end
  end
end
