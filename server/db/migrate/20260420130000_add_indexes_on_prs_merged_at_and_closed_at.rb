class AddIndexesOnPrsMergedAtAndClosedAt < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :prs, :merged_at, algorithm: :concurrently
    add_index :prs, :closed_at, algorithm: :concurrently
    add_index :prs, "COALESCE(merged_at, closed_at)", name: "index_prs_on_terminal_date", algorithm: :concurrently
  end
end
