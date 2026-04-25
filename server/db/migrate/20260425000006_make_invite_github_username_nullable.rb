class MakeInviteGithubUsernameNullable < ActiveRecord::Migration[8.1]
  def change
    change_column_null :invites, :github_username, true
  end
end
