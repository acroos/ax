class AddCiPassedToCommits < ActiveRecord::Migration[8.1]
  def change
    add_column :commits, :ci_passed, :boolean
  end
end
