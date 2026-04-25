require "rails_helper"

RSpec.describe WebhookHandlers::PrOpened do
  let!(:repo) { create(:repo, platform_owner: "octocat", platform_repo: "hello-world") }

  let(:pr_data) do
    {
      number: 1,
      title: "New PR",
      state: "open",
      commits: 3,
      head: { ref: "feature-branch" },
      created_at: "2026-01-01T00:00:00Z",
      merged_at: nil,
      closed_at: nil,
      html_url: "https://github.com/octocat/hello-world/pull/1",
      additions: 10,
      deletions: 2,
      changed_files: 1,
      user: { login: "octocat" }
    }
  end

  let(:repo_data) do
    { owner: { login: "octocat" }, name: "hello-world" }
  end

  it "creates a PR and initializes metrics" do
    handler = described_class.new(pr_data, repo_data)
    handler.call

    pr = Pr.find_by(repo: repo, number: 1)
    expect(pr).to be_present
    expect(pr.state).to eq("open")
    expect(pr.open_commit_count).to eq(3)
    expect(pr.pr_metrics.post_open_commits).to eq(0)
  end

  context "with installation-scoped repo lookup" do
    let(:org) { create(:organization) }
    let(:installation) { create(:github_installation, organization: org) }
    let!(:org_repo) { create(:repo, platform_owner: "octocat", platform_repo: "hello-world", organization: org, github_installation: installation) }

    it "prefers the repo scoped to the installation org" do
      # org_repo and repo both match owner/name; installation should pick org_repo
      handler = described_class.new(pr_data, repo_data, installation: installation)
      handler.call

      expect(Pr.find_by(repo: org_repo, number: 1)).to be_present
    end

    it "falls back to unscoped lookup when installation is nil" do
      handler = described_class.new(pr_data, repo_data, installation: nil)
      handler.call

      expect(Pr.exists?(repo: repo, number: 1)).to be true
    end
  end
end
