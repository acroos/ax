require "rails_helper"

RSpec.describe WebhookHandlers::PrMerged do
  let(:installation) { create(:github_installation) }
  let(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world", github_installation: installation) }
  let!(:pr) { create(:pr, repo: repo, number: 1, state: "open") }
  let!(:metrics) { create(:pr_metrics, pr: pr, metrics_finalized: false) }
  let(:fake_token) { "ghs_fake_token" }

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

  before do
    allow(GithubApp::InstallationToken).to receive(:fetch)
      .with(installation.github_installation_id)
      .and_return(fake_token)

    stub_request(:get, %r{api\.github\.com/repos/octocat/hello-world/pulls/1/files})
      .to_return(
        status: 200,
        body: [
          { filename: "src/app.rb", additions: 8, deletions: 1, changes: 9, status: "modified" },
          { filename: "src/app.test.ts", additions: 2, deletions: 1, changes: 3, status: "modified" }
        ].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    stub_request(:get, %r{api\.github\.com/repos/octocat/hello-world/pulls/1/commits})
      .to_return(
        status: 200,
        body: [
          { sha: "aaa111", commit: { author: { name: "octocat" }, message: "feat" } }
        ].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    stub_request(:get, %r{api\.github\.com/repos/octocat/hello-world/commits/aaa111\b})
      .to_return(
        status: 200,
        body: { sha: "aaa111", stats: { additions: 12, deletions: 2 } }.to_json,
        headers: { "Content-Type" => "application/json" }
      )
  end

  it "finalizes the PR metrics" do
    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(pr.reload.state).to eq("merged")
    expect(metrics.reload.metrics_finalized).to be true
    expect(metrics.finalized_at).to be_present
  end

  it "fetches file data and records PR files" do
    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(PrFile.where(pr: pr).count).to eq(2)
  end

  it "skips already finalized PRs" do
    original_time = 1.hour.ago
    metrics.update!(metrics_finalized: true, finalized_at: original_time)

    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(metrics.reload.finalized_at).to be_within(1.second).of(original_time)
  end

  it "preserves original finalized_at on redelivery" do
    original_time = 1.hour.ago
    metrics.update_columns(metrics_finalized: false, finalized_at: original_time)

    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(metrics.reload.metrics_finalized).to be true
    expect(metrics.finalized_at).to be_within(1.second).of(original_time)
  end

  it "does not finalize when GitHub API fetch fails" do
    stub_request(:get, %r{api\.github\.com/repos/octocat/hello-world/pulls/1/files})
      .to_return(status: 500, body: "Internal Server Error")

    handler = described_class.new(pr_data, repo_data)
    handler.call

    expect(pr.reload.state).to eq("merged")
    expect(metrics.reload.metrics_finalized).to be false
    expect(metrics.finalized_at).to be_nil
  end

  context "when repo has no GitHub installation" do
    let(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world", github_installation: nil) }

    it "finalizes metrics without fetching" do
      handler = described_class.new(pr_data, repo_data)
      handler.call

      expect(metrics.reload.metrics_finalized).to be true
      expect(PrFile.where(pr: pr).count).to eq(0)
    end
  end
end
