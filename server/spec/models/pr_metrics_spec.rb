require "rails_helper"

RSpec.describe PrMetrics, type: :model do
  describe "metric value validations" do
    it "rejects ci_success_rate outside 0..1" do
      metrics = build(:pr_metrics, ci_success_rate: 1.5)
      expect(metrics).not_to be_valid
      expect(metrics.errors[:ci_success_rate]).to be_present
    end

    it "rejects negative ci_success_rate" do
      metrics = build(:pr_metrics, ci_success_rate: -0.1)
      expect(metrics).not_to be_valid
    end

    it "accepts ci_success_rate within 0..1" do
      metrics = build(:pr_metrics, ci_success_rate: 0.85)
      expect(metrics).to be_valid
    end

    it "accepts nil ci_success_rate" do
      metrics = build(:pr_metrics, ci_success_rate: nil)
      expect(metrics).to be_valid
    end

    it "rejects negative post_open_commits" do
      metrics = build(:pr_metrics, post_open_commits: -1)
      expect(metrics).not_to be_valid
    end

    it "rejects line_revisit_rate above 1" do
      metrics = build(:pr_metrics, line_revisit_rate: 1.01)
      expect(metrics).not_to be_valid
      expect(metrics.errors[:line_revisit_rate]).to be_present
    end
  end

  describe "scoped write protection" do
    it "prevents updates to GitHub-derived fields on settled metrics" do
      metrics = create(:pr_metrics, metrics_finalized: true, finalized_at: Time.current, post_open_commits: 3)

      result = metrics.update(post_open_commits: 5)
      expect(result).to be false
      expect(metrics.errors[:base].first).to include("Settled GitHub metrics cannot be updated")
    end

    it "allows updates to non-finalized metrics" do
      metrics = create(:pr_metrics, metrics_finalized: false)

      result = metrics.update(post_open_commits: 7)
      expect(result).to be true
      expect(metrics.reload.post_open_commits).to eq(7)
    end

    it "allows finalizing a non-finalized metric" do
      metrics = create(:pr_metrics, metrics_finalized: false)

      result = metrics.update(metrics_finalized: true, finalized_at: Time.current)
      expect(result).to be true
      expect(metrics.reload.metrics_finalized).to be true
    end
  end
end
