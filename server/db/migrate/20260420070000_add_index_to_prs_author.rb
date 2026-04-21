class AddIndexToPrsAuthor < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :prs, :author, algorithm: :concurrently
  end
end
