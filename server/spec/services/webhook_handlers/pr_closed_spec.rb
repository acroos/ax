require "rails_helper"

RSpec.describe WebhookHandlers::PrClosed do
  let(:installation) { create(:github_installation) }
  let(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world", github_installation: installation) }
  let!(:pr) { create(:pr, repo: repo, number: 1, state: "open") }
  let!(:metrics) { create(:pr_metrics, pr: pr, metrics_finalized: false) }
  let(:fake_token) { "ghs_fake_token" }

  let(:pr_data) do
    {
      number: 1,
      title: "Closed PR",
      state: "closed",
      merged: false,
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

  before do
    allow(GithubApp::InstallationToken).to receive(:fetch)
      .with(installation.github_installation_id)
      .and_return(fake_token)

    stub_request(:get, %r{api\.github\.com/repos/octocat/hello-world/pulls/1/files})
      .to_return(
        status: 200,
        body: [ { filename: "src/app.rb", additions: 10, deletions: 2, changes: 12, status: "modified" } ].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    stub_request(:get, %r{api\.github\.com/repos/octocat/hello-world/pulls/1/commits})
      .to_return(
        status: 200,
        body: [ { sha: "bbb222", commit: { author: { name: "octocat" }, message: "wip" } } ].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    stub_request(:get, %r{api\.github\.com/repos/octocat/hello-world/commits/bbb222\b})
      .to_return(
        status: 200,
        body: { sha: "bbb222", stats: { additions: 10, deletions: 2 } }.to_json,
        headers: { "Content-Type" => "application/json" }
      )
  end

  it "finalizes the PR metrics with state closed" do
    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(pr.reload.state).to eq("closed")
    expect(metrics.reload.metrics_finalized).to be true
    expect(metrics.finalized_at).to be_present
  end

  it "fetches file data and computes metrics" do
    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(PrFile.where(pr: pr).count).to eq(1)
    expect(metrics.reload.has_tests).to be false
    expect(metrics.diff_churn_lines).to eq(0) # 10 - 10 = 0
  end

  it "defaults first_pass_accepted to true when no reviews exist" do
    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(metrics.reload.first_pass_accepted).to be true
  end

  it "skips already finalized PRs" do
    original_time = 1.hour.ago
    metrics.update!(metrics_finalized: true, finalized_at: original_time)

    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(metrics.reload.finalized_at).to be_within(1.second).of(original_time)
  end
end
