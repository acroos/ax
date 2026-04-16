require "rails_helper"

RSpec.describe WebhookHandlers::ReviewSubmitted do
  let(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world") }
  let(:pr) { create(:pr, repo: repo, number: 1) }
  let!(:metrics) { create(:pr_metrics, pr: pr) }

  let(:repo_data) { { owner: { login: "octocat" }, name: "hello-world" } }
  let(:pr_data) { { number: 1 } }

  describe "review cycle time" do
    it "captures review cycle time on first human review" do
      pr_opened = 2.hours.ago
      pr.update!(created_at_source: pr_opened.iso8601)

      review_submitted = 1.hour.ago
      review_data = {
        state: "APPROVED",
        submitted_at: review_submitted.iso8601,
        user: { type: "User" }
      }

      handler = described_class.new(review_data, pr_data, repo_data)
      handler.call

      metrics.reload
      expect(metrics.first_review_at).to be_present
      expect(metrics.review_cycle_time_minutes).to eq(60)
    end

    it "skips bot reviews" do
      pr.update!(created_at_source: 2.hours.ago.iso8601)

      review_data = {
        state: "APPROVED",
        submitted_at: 1.hour.ago.iso8601,
        user: { type: "Bot" }
      }

      handler = described_class.new(review_data, pr_data, repo_data)
      handler.call

      metrics.reload
      expect(metrics.first_review_at).to be_nil
      expect(metrics.review_cycle_time_minutes).to be_nil
    end

    it "only captures on first review" do
      pr_opened = 3.hours.ago
      pr.update!(created_at_source: pr_opened.iso8601)

      # First review
      first_review_time = 2.hours.ago
      review_data = {
        state: "APPROVED",
        submitted_at: first_review_time.iso8601,
        user: { type: "User" }
      }
      handler = described_class.new(review_data, pr_data, repo_data)
      handler.call

      # Second review
      second_review_time = 1.hour.ago
      review_data = {
        state: "APPROVED",
        submitted_at: second_review_time.iso8601,
        user: { type: "User" }
      }
      handler = described_class.new(review_data, pr_data, repo_data)
      handler.call

      metrics.reload
      # Should still be the first review time, not the second
      expect(metrics.first_review_at.to_i).to eq(first_review_time.to_i)
      expect(metrics.review_cycle_time_minutes).to eq(60)
    end

    it "skips finalized PRs" do
      metrics.update!(metrics_finalized: true, finalized_at: Time.current)

      pr_opened = 2.hours.ago
      pr.update!(created_at_source: pr_opened.iso8601)

      review_data = {
        state: "APPROVED",
        submitted_at: 1.hour.ago.iso8601,
        user: { type: "User" }
      }
      handler = described_class.new(review_data, pr_data, repo_data)
      handler.call

      metrics.reload
      expect(metrics.first_review_at).to be_nil
    end
  end
end
