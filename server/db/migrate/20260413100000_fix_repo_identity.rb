class FixRepoIdentity < ActiveRecord::Migration[8.0]
  def change
    # Remove the unique constraint on path — it's a local filesystem path
    # that differs per developer and causes duplicates.
    remove_index :repos, :path, unique: true
    add_index :repos, :path

    # Make path nullable (backfill-created repos may not have a local path)
    change_column_null :repos, :path, true

    # Canonical repo identity: (organization_id, github_owner, github_repo)
    add_index :repos, [ :organization_id, :github_owner, :github_repo ],
              unique: true,
              name: "index_repos_on_org_github_identity"
  end
end
