class RemoveSessionFieldsFromPrMetrics < ActiveRecord::Migration[8.0]
  def change
    change_table :pr_metrics do |t|
      t.remove :iteration_depth, type: :integer
      t.remove :token_cost_usd, type: :float
      t.remove :cache_hit_rate, type: :float
      t.remove :sidechain_rate, type: :float
      t.remove :re_read_rate, type: :float
      t.remove :autonomy_score, type: :float
    end
  end
end
