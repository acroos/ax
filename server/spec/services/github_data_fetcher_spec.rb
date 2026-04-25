require "rails_helper"

RSpec.describe GithubDataFetcher do
  let(:installation) { create(:github_installation) }
  let(:repo) { create(:repo, platform_owner: "acme", platform_repo: "widget", github_installation: installation) }
  let(:pr) { create(:pr, repo: repo, number: 42, additions: 20, deletions: 5) }

  let(:fake_token) { "ghs_fake_token" }
  let(:files_response) do
    [
      { filename: "src/app.rb", additions: 15, deletions: 3, changes: 18, status: "modified" },
      { filename: "spec/app_spec.rb", additions: 10, deletions: 0, changes: 10, status: "added" }
    ]
  end
  let(:commits_response) do
    [
      {
        sha: "abc123",
        commit: { author: { name: "dev" }, message: "first commit" }
      },
      {
        sha: "def456",
        commit: { author: { name: "dev" }, message: "second commit" }
      }
    ]
  end

  before do
    allow(GithubApp::InstallationToken).to receive(:fetch)
      .with(installation.github_installation_id)
      .and_return(fake_token)

    stub_request(:get, %r{api\.github\.com/repos/acme/widget/pulls/42/files})
      .to_return(status: 200, body: files_response.to_json, headers: { "Content-Type" => "application/json" })

    stub_request(:get, %r{api\.github\.com/repos/acme/widget/pulls/42/commits})
      .to_return(status: 200, body: commits_response.to_json, headers: { "Content-Type" => "application/json" })

    # Individual commit endpoints return stats
    stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/abc123\b})
      .to_return(status: 200, body: { sha: "abc123", stats: { additions: 12, deletions: 1 } }.to_json, headers: { "Content-Type" => "application/json" })

    stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/def456\b})
      .to_return(status: 200, body: { sha: "def456", stats: { additions: 13, deletions: 4 } }.to_json, headers: { "Content-Type" => "application/json" })
  end

  describe "#call" do
    it "creates PrFile records from GitHub API" do
      expect { described_class.new(pr).call }.to change { PrFile.count }.by(2)

      file = PrFile.find_by(pr: pr, filename: "src/app.rb")
      expect(file.additions).to eq(15)
      expect(file.deletions).to eq(3)
      expect(file.status).to eq("modified")
    end

    it "creates or updates Commit records from GitHub API" do
      expect { described_class.new(pr).call }.to change { Commit.count }.by(2)

      commit = Commit.find("abc123")
      expect(commit.additions).to eq(12)
      expect(commit.deletions).to eq(1)
      expect(commit.author).to eq("dev")
    end

    it "updates existing commits with stats from API" do
      Commit.create!(sha: "abc123", repo: repo, pr: pr, author: "dev", additions: 0, deletions: 0)

      expect { described_class.new(pr).call }.to change { Commit.count }.by(1) # only def456 is new

      commit = Commit.find("abc123")
      expect(commit.additions).to eq(12)
    end

    it "is idempotent for PrFiles" do
      described_class.new(pr).call
      expect { described_class.new(pr).call }.not_to change { PrFile.count }
    end

    context "when some check suites are incomplete" do
      before do
        stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/.+/check-suites})
          .to_return(
            status: 200,
            body: {
              total_count: 2,
              check_suites: [
                { id: 1, status: "completed", conclusion: "success" },
                { id: 2, status: "in_progress", conclusion: nil }
              ]
            }.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "sets ci_passed based on completed suites, ignoring in-progress ones" do
        described_class.new(pr).call

        commit = Commit.find("abc123")
        expect(commit.ci_passed).to be true
      end
    end

    context "when no check suites are completed" do
      before do
        stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/.+/check-suites})
          .to_return(
            status: 200,
            body: {
              total_count: 1,
              check_suites: [
                { id: 1, status: "in_progress", conclusion: nil }
              ]
            }.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "does not set ci_passed" do
        described_class.new(pr).call

        commit = Commit.find("abc123")
        expect(commit.ci_passed).to be_nil
      end
    end

    context "when all check suites are completed" do
      before do
        stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/.+/check-suites})
          .to_return(
            status: 200,
            body: {
              total_count: 2,
              check_suites: [
                { id: 1, status: "completed", conclusion: "success" },
                { id: 2, status: "completed", conclusion: "success" }
              ]
            }.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "sets ci_passed based on all suite conclusions" do
        described_class.new(pr).call

        commit = Commit.find("abc123")
        expect(commit.ci_passed).to be true
      end
    end

    context "when repo has no GitHub installation" do
      let(:repo) { create(:repo, platform_owner: "acme", platform_repo: "widget", github_installation: nil) }

      it "skips fetching without error" do
        expect { described_class.new(pr).call }.not_to change { PrFile.count }
      end
    end
  end
end
