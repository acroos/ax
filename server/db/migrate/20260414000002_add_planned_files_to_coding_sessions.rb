class AddPlannedFilesToCodingSessions < ActiveRecord::Migration[7.1]
  def change
    add_column :sessions, :planned_files, :text
  end
end
