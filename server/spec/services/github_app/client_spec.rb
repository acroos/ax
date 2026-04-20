require "rails_helper"

RSpec.describe GithubApp::Client do
  let(:installation) { create(:github_installation, github_installation_id: 555_000) }
  let(:client) { described_class.new(installation) }
  let(:fake_token) { "ghs_fake_client_token" }

  before do
    allow(GithubApp::InstallationToken).to receive(:fetch)
      .with(installation.github_installation_id)
      .and_return(fake_token)
  end

  describe "#list_pulls" do
    let(:pulls_response) do
      [
        { number: 1, title: "First PR", updated_at: 2.days.ago.iso8601 },
        { number: 2, title: "Second PR", updated_at: 1.day.ago.iso8601 }
      ]
    end

    before do
      stub_request(:get, %r{api\.github\.com/repos/acme/widget/pulls})
        .to_return(
          status: 200,
          body: pulls_response.to_json,
          headers: { "Content-Type" => "application/json" }
        )
    end

    it "returns pull requests for the repo" do
      pulls = client.list_pulls(owner: "acme", repo: "widget")
      expect(pulls.length).to eq(2)
      expect(pulls.first[:number]).to eq(1)
    end

    it "filters by since when provided" do
      pulls = client.list_pulls(owner: "acme", repo: "widget", since: 36.hours.ago)
      expect(pulls.length).to eq(1)
      expect(pulls.first[:number]).to eq(2)
    end

    it "authenticates with the installation token" do
      client.list_pulls(owner: "acme", repo: "widget")

      expect(WebMock).to have_requested(:get, %r{api\.github\.com/repos/acme/widget/pulls})
        .with(headers: { "Authorization" => "token #{fake_token}" })
    end
  end

  describe "#list_check_suites" do
    before do
      stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/abc123/check-suites})
        .to_return(
          status: 200,
          body: { total_count: 1, check_suites: [ { id: 1, status: "completed" } ] }.to_json,
          headers: { "Content-Type" => "application/json" }
        )
    end

    it "returns check suites for the ref" do
      result = client.list_check_suites(owner: "acme", repo: "widget", ref: "abc123")
      expect(result[:check_suites].length).to eq(1)
    end
  end

  describe "#list_pull_files" do
    before do
      stub_request(:get, %r{api\.github\.com/repos/acme/widget/pulls/42/files})
        .to_return(
          status: 200,
          body: [
            { filename: "src/app.rb", additions: 10, deletions: 2, changes: 12, status: "modified" }
          ].to_json,
          headers: { "Content-Type" => "application/json" }
        )
    end

    it "returns files for the pull request" do
      files = client.list_pull_files(owner: "acme", repo: "widget", number: 42)
      expect(files.length).to eq(1)
      expect(files.first[:filename]).to eq("src/app.rb")
    end
  end

  describe "#list_pull_commits" do
    before do
      stub_request(:get, %r{api\.github\.com/repos/acme/widget/pulls/42/commits})
        .to_return(
          status: 200,
          body: [
            { sha: "abc123", commit: { message: "feat: add feature" } }
          ].to_json,
          headers: { "Content-Type" => "application/json" }
        )
    end

    it "returns commits for the pull request" do
      commits = client.list_pull_commits(owner: "acme", repo: "widget", number: 42)
      expect(commits.length).to eq(1)
      expect(commits.first[:sha]).to eq("abc123")
    end
  end

  describe "#get_commit" do
    before do
      stub_request(:get, %r{api\.github\.com/repos/acme/widget/commits/abc123})
        .to_return(
          status: 200,
          body: {
            sha: "abc123",
            commit: { message: "feat: add feature" },
            stats: { additions: 10, deletions: 2, total: 12 }
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )
    end

    it "returns a single commit with stats" do
      commit = client.get_commit(owner: "acme", repo: "widget", sha: "abc123")
      expect(commit[:sha]).to eq("abc123")
      expect(commit[:stats][:additions]).to eq(10)
      expect(commit[:stats][:deletions]).to eq(2)
    end
  end

  describe "#list_repositories" do
    before do
      stub_request(:get, %r{api\.github\.com/installation/repositories})
        .to_return(
          status: 200,
          body: {
            total_count: 2,
            repositories: [
              { id: 1, name: "widget", full_name: "acme/widget" },
              { id: 2, name: "gadget", full_name: "acme/gadget" }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )
    end

    it "returns repositories accessible to the installation" do
      repos = client.list_repositories
      expect(repos.length).to eq(2)
      expect(repos.map { |r| r[:name] }).to eq(%w[widget gadget])
    end
  end
end
