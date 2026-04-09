require "rails_helper"

RSpec.describe WebhookHandlers::PrOpened do
  let!(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world") }

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
end
