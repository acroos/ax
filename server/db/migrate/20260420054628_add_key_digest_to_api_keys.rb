class AddKeyDigestToApiKeys < ActiveRecord::Migration[8.1]
  def change
    add_column :api_keys, :key_digest, :string
    add_index :api_keys, :key_digest, unique: true
  end
end
