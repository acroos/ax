class AddGitlabIdentityToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :gitlab_id, :bigint
    add_column :users, :gitlab_username, :string

    add_index :users, :gitlab_id, unique: true, where: "gitlab_id IS NOT NULL"

    # Allow nullable github_id/github_username for GitLab-only users
    change_column_null :users, :github_id, true
    change_column_null :users, :github_username, true

    # At least one platform identity must exist
    reversible do |dir|
      dir.up do
        execute <<~SQL
          ALTER TABLE users ADD CONSTRAINT users_platform_identity_check
            CHECK (github_id IS NOT NULL OR gitlab_id IS NOT NULL)
        SQL
      end
      dir.down do
        execute "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_identity_check"
      end
    end
  end
end
