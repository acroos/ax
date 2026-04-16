require "rails_helper"

RSpec.describe PrMetrics, type: :model do
  describe "scoped write protection" do
    it "prevents updates to GitHub-derived fields on settled metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current, post_open_commits: 3)

      result = metrics.update(post_open_commits: 5)
      expect(result).to be false
      expect(metrics.errors[:base].first).to include("Settled GitHub metrics cannot be updated")
    end

    it "allows updates to session-derived fields on settled metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current)

      result = metrics.update(token_cost_usd: 1.23, iteration_depth: 5)
      expect(result).to be true
      expect(metrics.reload.token_cost_usd).to eq(1.23)
      expect(metrics.reload.iteration_depth).to eq(5)
    end

    it "allows update_session_metrics! on settled metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current)

      metrics.update_session_metrics!(
        token_cost_usd: 5.67,
        iteration_depth: 10
      )
      metrics.reload
      expect(metrics.token_cost_usd).to eq(5.67)
      expect(metrics.iteration_depth).to eq(10)
    end

    it "update_session_metrics! ignores non-session fields" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current, post_open_commits: 3)

      # post_open_commits is a GitHub-derived field — should be filtered out
      metrics.update_session_metrics!(
        token_cost_usd: 4.2,
        post_open_commits: 99
      )
      metrics.reload
      expect(metrics.token_cost_usd).to eq(4.2)
      expect(metrics.post_open_commits).to eq(3)
    end

    it "allows updates to non-finalized metrics" do
      metrics = create(:pr_metrics, metrics_finalized: false)

      result = metrics.update(iteration_depth: 7)
      expect(result).to be true
      expect(metrics.reload.iteration_depth).to eq(7)
    end

    it "allows finalizing a non-finalized metric" do
      metrics = create(:pr_metrics, metrics_finalized: false)

      result = metrics.update(metrics_finalized: true, finalized_at: Time.current)
      expect(result).to be true
      expect(metrics.reload.metrics_finalized).to be true
    end
  end
end
