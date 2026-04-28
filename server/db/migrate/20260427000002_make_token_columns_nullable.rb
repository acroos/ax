class MakeTokenColumnsNullable < ActiveRecord::Migration[8.0]
  def change
    change_column_null :sessions, :input_tokens, true
    change_column_null :sessions, :output_tokens, true
    change_column_null :sessions, :cache_creation_input_tokens, true
    change_column_null :sessions, :cache_read_input_tokens, true
    # No data backfill needed — existing rows have integer values which
    # remain valid; only future Cursor rows will arrive as NULL.
  end
end
