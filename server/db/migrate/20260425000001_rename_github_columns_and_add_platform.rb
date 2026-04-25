class RenameGithubColumnsAndAddPlatform < ActiveRecord::Migration[8.1]
  def change
    # Rename github-specific columns to generic platform names
    rename_column :repos, :github_owner, :platform_owner
    rename_column :repos, :github_repo, :platform_repo

    # Add platform discriminator (github is the default for existing data)
    add_column :repos, :platform, :string, default: "github", null: false

    # Replace the old unique index with one that includes platform
    remove_index :repos, name: "index_repos_on_org_github_identity"
    add_index :repos, [ :organization_id, :platform, :platform_owner, :platform_repo ],
              unique: true, name: "index_repos_on_org_platform_identity"
  end
end
