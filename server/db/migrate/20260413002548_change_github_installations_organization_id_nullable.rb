class ChangeGithubInstallationsOrganizationIdNullable < ActiveRecord::Migration[8.1]
  def change
    change_column_null :github_installations, :organization_id, true
  end
end
