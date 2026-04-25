require "rails_helper"

RSpec.describe GithubApp::BackfillInstallationJob do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:installation) do
    create(:github_installation,
      organization: organization,
      github_installation_id: 42_000,
      account_login: "acme",
      status: "active"
    )
  end

  let(:fake_token) { "ghs_backfill_token" }

  let(:gh_repos) do
    [
      { name: "widget", owner: { login: "acme" }, full_name: "acme/widget" },
      { name: "gadget", owner: { login: "acme" }, full_name: "acme/gadget" }
    ]
  end

  let(:merged_pr) do
    {
      number: 1,
      title: "Add feature",
      state: "closed",
      commits: 3,
      head: { ref: "feature/add-stuff" },
      base: { repo: { owner: { login: "acme" }, name: "widget" } },
      created_at: 10.days.ago.iso8601,
      merged_at: 5.days.ago.iso8601,
      closed_at: 5.days.ago.iso8601,
      html_url: "https://github.com/acme/widget/pull/1",
      additions: 50,
      deletions: 10,
      changed_files: 3,
      updated_at: 5.days.ago.iso8601,
      user: { login: "dev1" }
    }
  end

  let(:open_pr) do
    {
      number: 2,
      title: "WIP feature",
      state: "open",
      commits: 1,
      head: { ref: "feature/wip" },
      base: { repo: { owner: { login: "acme" }, name: "widget" } },
      created_at: 2.days.ago.iso8601,
      merged_at: nil,
      closed_at: nil,
      html_url: "https://github.com/acme/widget/pull/2",
      additions: 20,
      deletions: 0,
      changed_files: 1,
      updated_at: 1.day.ago.iso8601,
      user: { login: "dev2" }
    }
  end

  let(:closed_pr) do
    {
      number: 3,
      title: "Abandoned feature",
      state: "closed",
      commits: 2,
      head: { ref: "feature/abandoned" },
      base: { repo: { owner: { login: "acme" }, name: "gadget" } },
      created_at: 30.days.ago.iso8601,
      merged_at: nil,
      closed_at: 20.days.ago.iso8601,
      html_url: "https://github.com/acme/gadget/pull/3",
      additions: 15,
      deletions: 5,
      changed_files: 2,
      updated_at: 20.days.ago.iso8601,
      user: { login: "dev1" }
    }
  end

  before do
    allow(GithubApp::InstallationToken).to receive(:fetch)
      .with(installation.github_installation_id)
      .and_return(fake_token)

    stub_request(:get, %r{api\.github\.com/installation/repositories})
      .to_return(
        status: 200,
        body: { total_count: gh_repos.length, repositories: gh_repos }.to_json,
        headers: { "Content-Type" => "application/json" }
      )

    stub_request(:get, %r{api\.github\.com/repos/acme/widget/pulls\b})
      .to_return(
        status: 200,
        body: [ merged_pr, open_pr ].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    stub_request(:get, %r{api\.github\.com/repos/acme/gadget/pulls\b})
      .to_return(
        status: 200,
        body: [ closed_pr ].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    # Stub file and commit fetches used by GithubDataFetcher (called by PrMerged/PrClosed)
    stub_request(:get, %r{api\.github\.com/repos/acme/.+/pulls/\d+/files})
      .to_return(
        status: 200,
        body: [].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    stub_request(:get, %r{api\.github\.com/repos/acme/.+/pulls/\d+/commits})
      .to_return(
        status: 200,
        body: [].to_json,
        headers: { "Content-Type" => "application/json" }
      )
  end

  # Stub review fetches used by BackfillRepoJob
  before do
    stub_request(:get, %r{api\.github\.com/repos/acme/.+/pulls/\d+/reviews})
      .to_return(
        status: 200,
        body: [].to_json,
        headers: { "Content-Type" => "application/json" }
      )

    # BackfillInstallationJob now delegates to BackfillRepoJob —
    # execute inline so assertions see the results.
    allow(BackfillRepoJob).to receive(:perform_later) do |repo_id|
      BackfillRepoJob.perform_now(repo_id)
    end
  end

  describe "#perform" do
    it "creates repos for all repositories in the installation" do
      expect { described_class.new.perform(installation.id) }
        .to change(Repo, :count).by(2)

      widget = Repo.find_by(platform_owner: "acme", platform_repo: "widget")
      expect(widget.organization).to eq(organization)
      expect(widget.github_installation).to eq(installation)
      expect(widget.path).to eq("acme/widget")

      gadget = Repo.find_by(platform_owner: "acme", platform_repo: "gadget")
      expect(gadget.organization).to eq(organization)
    end

    it "creates PR records from backfilled data" do
      expect { described_class.new.perform(installation.id) }
        .to change(Pr, :count).by(3)
    end

    it "finalizes merged PRs" do
      described_class.new.perform(installation.id)

      widget = Repo.find_by(platform_owner: "acme", platform_repo: "widget")
      pr = Pr.find_by(repo: widget, number: 1)
      expect(pr.state).to eq("merged")
      expect(pr.pr_metrics).to be_finalized
    end

    it "finalizes closed (unmerged) PRs" do
      described_class.new.perform(installation.id)

      gadget = Repo.find_by(platform_owner: "acme", platform_repo: "gadget")
      pr = Pr.find_by(repo: gadget, number: 3)
      expect(pr.state).to eq("closed")
      expect(pr.pr_metrics).to be_finalized
    end

    it "does not finalize open PRs" do
      described_class.new.perform(installation.id)

      widget = Repo.find_by(platform_owner: "acme", platform_repo: "widget")
      pr = Pr.find_by(repo: widget, number: 2)
      expect(pr.state).to eq("open")
      expect(pr.pr_metrics).not_to be_finalized
    end

    it "updates last_synced_at on the installation" do
      described_class.new.perform(installation.id)
      expect(installation.reload.last_synced_at).to be_within(2.seconds).of(Time.current)
    end

    it "skips inactive installations" do
      installation.update!(status: "suspended")

      described_class.new.perform(installation.id)

      expect(Repo.count).to eq(0)
      expect(installation.reload.last_synced_at).to be_nil
    end

    it "upserts existing repos without duplicating" do
      create(:repo, platform_owner: "acme", platform_repo: "widget", path: "acme/widget", organization: organization)

      expect { described_class.new.perform(installation.id) }
        .to change(Repo, :count).by(1) # only gadget is new

      widget = Repo.find_by(platform_owner: "acme", platform_repo: "widget")
      expect(widget.github_installation).to eq(installation)
    end

    it "continues processing other PRs when one fails" do
      allow_any_instance_of(WebhookHandlers::PrOpened).to receive(:call).and_call_original
      # Make the first PR in widget fail by stubbing PrOpened to raise for PR #1
      call_count = 0
      allow_any_instance_of(WebhookHandlers::PrOpened).to receive(:call).and_wrap_original do |method, *args|
        call_count += 1
        raise "Simulated failure" if call_count == 1
        method.call(*args)
      end

      # Should not raise — errors are caught per-PR
      expect { described_class.new.perform(installation.id) }.not_to raise_error

      # The other PRs should still have been processed
      expect(Pr.count).to be >= 1
    end

    it "is enqueued on the default queue" do
      expect(described_class.new.queue_name).to eq("default")
    end
  end

  describe "retry behavior" do
    it "is configured to retry on Octokit::TooManyRequests" do
      handler = described_class.rescue_handlers.find { |h| h.first == "Octokit::TooManyRequests" }
      expect(handler).not_to be_nil
    end

    it "is configured to retry on Octokit::ServerError" do
      handler = described_class.rescue_handlers.find { |h| h.first == "Octokit::ServerError" }
      expect(handler).not_to be_nil
    end
  end
end
