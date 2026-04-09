require "rails_helper"

RSpec.describe WebhookHandlers::ReviewSubmitted do
  let(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world") }
  let(:pr) { create(:pr, repo: repo, number: 1) }
  let!(:metrics) { create(:pr_metrics, pr: pr, first_pass_accepted: nil) }

  let(:repo_data) { { owner: { login: "octocat" }, name: "hello-world" } }
  let(:pr_data) { { number: 1 } }

  it "sets first_pass_accepted to false on CHANGES_REQUESTED" do
    review_data = { state: "CHANGES_REQUESTED" }
    handler = described_class.new(review_data, pr_data, repo_data)
    handler.call

    expect(metrics.reload.first_pass_accepted).to be false
  end

  it "sets first_pass_accepted to true on APPROVED when not yet set" do
    review_data = { state: "APPROVED" }
    handler = described_class.new(review_data, pr_data, repo_data)
    handler.call

    expect(metrics.reload.first_pass_accepted).to be true
  end

  it "does not override false with true (latch)" do
    metrics.update!(first_pass_accepted: false)

    review_data = { state: "APPROVED" }
    handler = described_class.new(review_data, pr_data, repo_data)
    handler.call

    expect(metrics.reload.first_pass_accepted).to be false
  end

  it "skips finalized PRs" do
    metrics.update!(metrics_finalized: true, finalized_at: Time.current, first_pass_accepted: true)

    review_data = { state: "CHANGES_REQUESTED" }
    handler = described_class.new(review_data, pr_data, repo_data)
    handler.call

    # Should still be true because it's finalized
    expect(metrics.reload.first_pass_accepted).to be true
  end
end
