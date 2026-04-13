require "rails_helper"

RSpec.describe PrMetrics, type: :model do
  describe "scoped write protection" do
    it "prevents updates to GitHub-derived fields on settled metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current, has_tests: true)

      result = metrics.update(has_tests: false)
      expect(result).to be false
      expect(metrics.errors[:base].first).to include("Settled GitHub metrics cannot be updated")
    end

    it "allows updates to session-derived fields on settled metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current)

      result = metrics.update(messages_per_pr: 99, token_cost_usd: 1.23)
      expect(result).to be true
      expect(metrics.reload.messages_per_pr).to eq(99)
      expect(metrics.reload.token_cost_usd).to eq(1.23)
    end

    it "allows update_session_metrics! on settled metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current)

      metrics.update_session_metrics!(
        messages_per_pr: 42,
        token_cost_usd: 5.67,
        iteration_depth: 10
      )
      metrics.reload
      expect(metrics.messages_per_pr).to eq(42)
      expect(metrics.token_cost_usd).to eq(5.67)
      expect(metrics.iteration_depth).to eq(10)
    end

    it "update_session_metrics! ignores non-session fields" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current, has_tests: true)

      # has_tests is a GitHub-derived field — should be filtered out
      metrics.update_session_metrics!(
        messages_per_pr: 42,
        has_tests: false
      )
      metrics.reload
      expect(metrics.messages_per_pr).to eq(42)
      expect(metrics.has_tests).to be true
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
