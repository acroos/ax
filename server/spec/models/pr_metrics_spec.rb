require "rails_helper"

RSpec.describe PrMetrics, type: :model do
  describe "finalization immutability" do
    it "prevents updates to finalized metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current)

      result = metrics.update(messages_per_pr: 99)
      expect(result).to be false
      expect(metrics.errors[:base]).to include("Finalized metrics cannot be updated")
    end

    it "allows updates to non-finalized metrics" do
      metrics = create(:pr_metrics, metrics_finalized: false)

      result = metrics.update(messages_per_pr: 99)
      expect(result).to be true
      expect(metrics.reload.messages_per_pr).to eq(99)
    end

    it "allows finalizing a non-finalized metric" do
      metrics = create(:pr_metrics, metrics_finalized: false)

      result = metrics.update(metrics_finalized: true, finalized_at: Time.current)
      expect(result).to be true
      expect(metrics.reload.metrics_finalized).to be true
    end
  end
end
