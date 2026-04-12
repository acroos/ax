class AddGithubInstallationToRepos < ActiveRecord::Migration[8.1]
  def change
    add_reference :repos, :github_installation, foreign_key: true, null: true
  end
end
