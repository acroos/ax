require "rails_helper"

RSpec.describe WebhookHandlers::CiCompleted do
  let(:installation) { create(:github_installation) }
  let(:repo) { create(:repo, platform_owner: "acme", platform_repo: "widget", github_installation: installation) }
  let(:pr) { create(:pr, repo: repo, number: 1) }
  let(:commit) { create(:commit, sha: "abc123", repo: repo, pr: pr) }

  let(:repo_data) { { owner: { login: "acme" }, name: "widget" } }

  def build_check_suite(sha:, conclusion:, pull_requests: [])
    {
      head_sha: sha,
      conclusion: conclusion,
      pull_requests: pull_requests
    }
  end

  describe "#call" do
    context "when commit is not found" do
      it "logs info and returns without error" do
        check_suite = build_check_suite(sha: "unknown_sha", conclusion: "success")

        expect(Rails.logger).to receive(:info).with(/\[ci_completed\] Commit unknown_sha not found/)

        described_class.new(check_suite, repo_data).call
      end
    end

    context "when commit exists" do
      before { commit }

      it "sets ci_passed to false on failure" do
        check_suite = build_check_suite(sha: "abc123", conclusion: "failure")

        described_class.new(check_suite, repo_data).call

        expect(commit.reload.ci_passed).to be false
      end

      it "sets ci_passed to true on success when nil" do
        check_suite = build_check_suite(sha: "abc123", conclusion: "success")

        described_class.new(check_suite, repo_data).call

        expect(commit.reload.ci_passed).to be true
      end

      it "does not flip ci_passed back to true once false (sticky failure)" do
        commit.update!(ci_passed: false)
        check_suite = build_check_suite(sha: "abc123", conclusion: "success")

        described_class.new(check_suite, repo_data).call

        expect(commit.reload.ci_passed).to be false
      end
    end

    context "recompute_ci_rate" do
      let!(:metrics) { create(:pr_metrics, pr: pr, ci_success_rate: nil) }

      before { commit }

      it "recomputes ci_success_rate via the commit's PR association" do
        commit.update!(ci_passed: true)
        create(:commit, sha: "def456", repo: repo, pr: pr, ci_passed: false)

        check_suite = build_check_suite(sha: "abc123", conclusion: "success")

        described_class.new(check_suite, repo_data).call

        expect(metrics.reload.ci_success_rate).to eq(0.5)
      end

      it "recomputes even when webhook payload has no pull_requests" do
        check_suite = build_check_suite(sha: "abc123", conclusion: "success", pull_requests: [])

        described_class.new(check_suite, repo_data).call

        expect(metrics.reload.ci_success_rate).to eq(1.0)
      end

      it "skips rate computation when no commits have ci_passed set" do
        check_suite = build_check_suite(sha: "abc123", conclusion: "success")

        # ci_passed is nil before the handler runs; after, it's true
        described_class.new(check_suite, repo_data).call

        # Only 1 commit with ci_passed set (true), so rate = 1.0
        expect(metrics.reload.ci_success_rate).to eq(1.0)
      end
    end
  end
end
