class ConvertTimestampStringsToDatetime < ActiveRecord::Migration[8.1]
  def up
    # Drop expression index that depends on string columns
    remove_index :prs, name: "index_prs_on_terminal_date"

    # PR columns: ISO 8601 string → datetime
    change_column :prs, :created_at_source, :datetime, using: "created_at_source::timestamptz"
    change_column :prs, :merged_at, :datetime, using: "merged_at::timestamptz"
    change_column :prs, :closed_at, :datetime, using: "closed_at::timestamptz"

    # Session columns: epoch milliseconds (bigint) → datetime
    change_column :sessions, :started_at, :datetime,
      using: "CASE WHEN started_at IS NOT NULL AND started_at > 0 THEN to_timestamp(started_at / 1000.0) END"
    change_column :sessions, :ended_at, :datetime,
      using: "CASE WHEN ended_at IS NOT NULL AND ended_at > 0 THEN to_timestamp(ended_at / 1000.0) END"

    # Commit column: ISO 8601 string → datetime
    change_column :commits, :committed_at, :datetime, using: "committed_at::timestamptz"

    # Recreate expression index on now-timestamp columns
    add_index :prs, "COALESCE(merged_at, closed_at)", name: "index_prs_on_terminal_date"
  end

  def down
    remove_index :prs, name: "index_prs_on_terminal_date"

    # Revert PR columns to string
    change_column :prs, :created_at_source, :string, using: "to_char(created_at_source, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"
    change_column :prs, :merged_at, :string, using: "to_char(merged_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"
    change_column :prs, :closed_at, :string, using: "to_char(closed_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"

    # Revert session columns to bigint (epoch ms)
    change_column :sessions, :started_at, :bigint,
      using: "CASE WHEN started_at IS NOT NULL THEN (EXTRACT(EPOCH FROM started_at) * 1000)::bigint END"
    change_column :sessions, :ended_at, :bigint,
      using: "CASE WHEN ended_at IS NOT NULL THEN (EXTRACT(EPOCH FROM ended_at) * 1000)::bigint END"

    # Revert commit column to string
    change_column :commits, :committed_at, :string, using: "to_char(committed_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"

    add_index :prs, "COALESCE(merged_at, closed_at)", name: "index_prs_on_terminal_date"
  end
end
