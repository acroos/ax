require "rails_helper"

RSpec.describe ReconcileCiDataJob do
  let(:installation) { create(:github_installation) }
  let(:repo) { create(:repo, github_owner: "acme", github_repo: "widget", github_installation: installation) }
  let(:pr) { create(:pr, repo: repo, number: 1) }

  let(:fake_token) { "ghs_fake_token" }

  before do
    allow(GithubApp::InstallationToken).to receive(:fetch)
      .with(installation.github_installation_id)
      .and_return(fake_token)
  end

  describe "backfill_missing_ci_status" do
    it "fetches CI status for commits with nil ci_passed on finalized PRs" do
      commit = create(:commit, sha: "abc123", repo: repo, pr: pr, ci_passed: nil)
      create(:pr_metrics, pr: pr, ci_success_rate: nil, metrics_finalized: true)

      stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/abc123/check-suites})
        .to_return(
          status: 200,
          body: {
            total_count: 1,
            check_suites: [
              { id: 1, status: "completed", conclusion: "success" }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      described_class.new.perform

      expect(commit.reload.ci_passed).to be true
    end

    it "sets ci_passed to false when a completed suite has failed" do
      commit = create(:commit, sha: "abc123", repo: repo, pr: pr, ci_passed: nil)
      create(:pr_metrics, pr: pr, ci_success_rate: nil, metrics_finalized: true)

      stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/abc123/check-suites})
        .to_return(
          status: 200,
          body: {
            total_count: 1,
            check_suites: [
              { id: 1, status: "completed", conclusion: "failure" }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      described_class.new.perform

      expect(commit.reload.ci_passed).to be false
    end

    it "skips commits on non-finalized PRs" do
      commit = create(:commit, sha: "abc123", repo: repo, pr: pr, ci_passed: nil)
      create(:pr_metrics, pr: pr, ci_success_rate: nil, metrics_finalized: false)

      described_class.new.perform

      expect(commit.reload.ci_passed).to be_nil
    end

    it "skips repos without an active installation" do
      repo_no_install = create(:repo, github_owner: "acme", github_repo: "other", github_installation: nil)
      pr2 = create(:pr, repo: repo_no_install, number: 2)
      commit = create(:commit, sha: "abc123", repo: repo_no_install, pr: pr2, ci_passed: nil)
      create(:pr_metrics, pr: pr2, ci_success_rate: nil, metrics_finalized: true)

      described_class.new.perform

      expect(commit.reload.ci_passed).to be_nil
    end
  end

  describe "recompute_stale_rates" do
    it "recomputes ci_success_rate for finalized PRs with nil rate but ci data on commits" do
      create(:commit, sha: "abc123", repo: repo, pr: pr, ci_passed: true)
      create(:commit, sha: "def456", repo: repo, pr: pr, ci_passed: false)
      metrics = create(:pr_metrics, pr: pr, ci_success_rate: nil, metrics_finalized: true)

      described_class.new.perform

      expect(metrics.reload.ci_success_rate).to eq(0.5)
    end

    it "skips PRs where all commits still have nil ci_passed" do
      create(:commit, sha: "abc123", repo: repo, pr: pr, ci_passed: nil)
      metrics = create(:pr_metrics, pr: pr, ci_success_rate: nil, metrics_finalized: true)

      # backfill_missing_ci_status will try to fetch — return no completed suites
      stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/abc123/check-suites})
        .to_return(
          status: 200,
          body: { total_count: 1, check_suites: [ { id: 1, status: "in_progress", conclusion: nil } ] }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      described_class.new.perform

      expect(metrics.reload.ci_success_rate).to be_nil
    end

    it "does not touch PRs that already have a ci_success_rate" do
      create(:commit, sha: "abc123", repo: repo, pr: pr, ci_passed: false)
      metrics = create(:pr_metrics, pr: pr, ci_success_rate: 1.0, metrics_finalized: true)

      described_class.new.perform

      expect(metrics.reload.ci_success_rate).to eq(1.0)
    end
  end
end
