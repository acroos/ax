class AddGitlabFieldsToRepos < ActiveRecord::Migration[8.1]
  def change
    add_column :repos, :gitlab_project_id, :bigint
    add_column :repos, :gitlab_webhook_id, :bigint
  end
end
