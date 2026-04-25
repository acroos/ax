class AddGitlabUsernameToInvites < ActiveRecord::Migration[8.1]
  def change
    add_column :invites, :platform, :string, default: "github", null: false
    add_column :invites, :gitlab_username, :string

    # Update the unique index to include platform
    remove_index :invites, name: "idx_on_organization_id_github_username_status_2150455612"
    add_index :invites, [ :organization_id, :platform, :github_username, :status ],
              unique: true,
              name: "index_invites_on_org_platform_username_status",
              where: "github_username IS NOT NULL"
    add_index :invites, [ :organization_id, :platform, :gitlab_username, :status ],
              unique: true,
              name: "index_invites_on_org_platform_gitlab_username_status",
              where: "gitlab_username IS NOT NULL"
  end
end
