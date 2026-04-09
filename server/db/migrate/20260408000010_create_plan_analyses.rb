class CreatePlanAnalyses < ActiveRecord::Migration[8.1]
  def change
    create_table :plan_analyses do |t|
      t.references :pr, foreign_key: true
      t.string :plan_file
      t.float :coverage_score
      t.float :deviation_score
      t.boolean :scope_creep_detected, default: false
      t.text :planned_files
      t.text :actual_files
      t.text :analysis_json
      t.timestamps
    end
  end
end
