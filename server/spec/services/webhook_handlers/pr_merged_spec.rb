require "rails_helper"

RSpec.describe WebhookHandlers::PrMerged do
  let(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world") }
  let!(:pr) { create(:pr, repo: repo, number: 1, state: "open") }
  let!(:metrics) { create(:pr_metrics, pr: pr, metrics_finalized: false) }

  let(:pr_data) do
    {
      number: 1,
      title: "Merged PR",
      state: "closed",
      merged: true,
      merged_at: "2026-01-02T00:00:00Z",
      head: { ref: "feature" },
      created_at: "2026-01-01T00:00:00Z",
      closed_at: "2026-01-02T00:00:00Z",
      html_url: "https://github.com/octocat/hello-world/pull/1",
      additions: 10,
      deletions: 2,
      changed_files: 1,
      user: { login: "octocat" }
    }
  end

  let(:repo_data) { { owner: { login: "octocat" }, name: "hello-world" } }

  it "finalizes the PR metrics" do
    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(pr.reload.state).to eq("merged")
    expect(metrics.reload.metrics_finalized).to be true
    expect(metrics.finalized_at).to be_present
  end

  it "skips already finalized PRs" do
    original_time = 1.hour.ago
    metrics.update!(metrics_finalized: true, finalized_at: original_time)

    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(metrics.reload.finalized_at).to be_within(1.second).of(original_time)
  end
end
