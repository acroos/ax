class FixRepoIdentity < ActiveRecord::Migration[8.0]
  def up
    remove_index :repos, :path, unique: true
    add_index :repos, :path

    change_column_null :repos, :path, true

    # Delete duplicate repos (keep lowest id per identity group).
    # No real user data in prod — safe to discard duplicates entirely.
    dupe_ids = <<~SQL.freeze
      SELECT r.id FROM repos r
      JOIN (
        SELECT MIN(id) AS keeper_id, organization_id, github_owner, github_repo
        FROM repos
        WHERE organization_id IS NOT NULL AND github_owner IS NOT NULL AND github_repo IS NOT NULL
        GROUP BY organization_id, github_owner, github_repo
        HAVING COUNT(*) > 1
      ) grp ON r.organization_id = grp.organization_id
        AND r.github_owner = grp.github_owner
        AND r.github_repo = grp.github_repo
        AND r.id != grp.keeper_id
    SQL

    # Clear children (FKs don't cascade) then delete the dupes
    execute "DELETE FROM pr_files WHERE pr_id IN (SELECT id FROM prs WHERE repo_id IN (#{dupe_ids}))"
    execute "DELETE FROM pr_metrics WHERE pr_id IN (SELECT id FROM prs WHERE repo_id IN (#{dupe_ids}))"
    execute "DELETE FROM plan_analyses WHERE pr_id IN (SELECT id FROM prs WHERE repo_id IN (#{dupe_ids}))"
    execute "DELETE FROM session_prs WHERE pr_id IN (SELECT id FROM prs WHERE repo_id IN (#{dupe_ids}))"
    execute "UPDATE commits SET pr_id = NULL WHERE pr_id IN (SELECT id FROM prs WHERE repo_id IN (#{dupe_ids}))"
    execute "DELETE FROM prs WHERE repo_id IN (#{dupe_ids})"
    execute "DELETE FROM commits WHERE repo_id IN (#{dupe_ids})"
    execute "DELETE FROM sessions WHERE repo_id IN (#{dupe_ids})"
    execute "DELETE FROM repo_metrics WHERE repo_id IN (#{dupe_ids})"
    execute "DELETE FROM watched_repos WHERE repo_id IN (#{dupe_ids})"
    execute "DELETE FROM repos WHERE id IN (#{dupe_ids})"

    add_index :repos, [ :organization_id, :github_owner, :github_repo ],
              unique: true,
              name: "index_repos_on_org_github_identity"
  end

  def down
    remove_index :repos, name: "index_repos_on_org_github_identity"
    change_column_null :repos, :path, false, ""
    remove_index :repos, :path
    add_index :repos, :path, unique: true
  end
end
