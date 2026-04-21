class BackfillSessionPushedBy < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    # Backfill pushed_by from the most common commit author per session.
    # Uses DISTINCT ON to pick one author per session (the most frequent,
    # breaking ties alphabetically).
    execute <<~SQL
      UPDATE sessions
      SET pushed_by = backfill.author, updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (c.session_id) c.session_id, c.author
        FROM commits c
        WHERE c.session_id IS NOT NULL
          AND c.author IS NOT NULL
        GROUP BY c.session_id, c.author
        ORDER BY c.session_id, COUNT(*) DESC, c.author
      ) backfill
      WHERE sessions.id = backfill.session_id
        AND sessions.pushed_by IS NULL
    SQL

    # For sessions with no commits, fall back to the single member of the
    # owning org (covers personal orgs and single-member team orgs).
    execute <<~SQL
      UPDATE sessions
      SET pushed_by = solo.github_username, updated_at = NOW()
      FROM (
        SELECT r.id AS repo_id, u.github_username
        FROM repos r
        INNER JOIN organizations o ON o.id = r.organization_id
        INNER JOIN org_memberships om ON om.organization_id = o.id
        INNER JOIN users u ON u.id = om.user_id
        GROUP BY r.id, u.github_username
        HAVING COUNT(om.id) = 1
      ) solo
      WHERE sessions.repo_id = solo.repo_id
        AND sessions.pushed_by IS NULL
    SQL

    add_index :sessions, :pushed_by, algorithm: :concurrently
  end

  def down
    remove_index :sessions, :pushed_by
  end
end
