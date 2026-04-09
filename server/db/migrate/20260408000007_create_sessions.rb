class CreateSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :sessions, id: false do |t|
      t.string :id, primary_key: true
      t.references :repo, foreign_key: true
      t.string :branch
      t.bigint :started_at
      t.bigint :ended_at
      t.integer :message_count, default: 0
      t.integer :turn_count, default: 0
      t.string :cwd
      t.integer :input_tokens, default: 0
      t.integer :output_tokens, default: 0
      t.integer :cache_creation_input_tokens, default: 0
      t.integer :cache_read_input_tokens, default: 0
      t.float :total_cost_usd
      t.string :primary_model
      t.string :pushed_by
      t.timestamps
    end
  end
end
