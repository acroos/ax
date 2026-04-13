require "rails_helper"

RSpec.describe ProcessGitHubWebhookJob do
  describe "installation event routing" do
    let!(:installation) { create(:github_installation, github_installation_id: 12345) }

    it "routes installation.created to InstallationCreated handler" do
      payload = { action: "created", installation: { id: 99999, account: { login: "org", type: "Organization" }, target_type: "Organization", repository_selection: "all", permissions: {}, events: [] } }

      expect_any_instance_of(WebhookHandlers::InstallationCreated).to receive(:call)
      described_class.new.perform("installation", payload.to_json)
    end

    it "routes installation.deleted to InstallationDeleted handler" do
      payload = { action: "deleted", installation: { id: 12345 } }

      expect_any_instance_of(WebhookHandlers::InstallationDeleted).to receive(:call)
      described_class.new.perform("installation", payload.to_json)
    end

    it "routes installation.suspend to InstallationSuspend handler" do
      payload = { action: "suspend", installation: { id: 12345 } }

      expect_any_instance_of(WebhookHandlers::InstallationSuspend).to receive(:call)
      described_class.new.perform("installation", payload.to_json)
    end

    it "routes installation.unsuspend to InstallationUnsuspend handler" do
      payload = { action: "unsuspend", installation: { id: 12345 } }

      expect_any_instance_of(WebhookHandlers::InstallationUnsuspend).to receive(:call)
      described_class.new.perform("installation", payload.to_json)
    end

    it "ignores unknown installation actions" do
      payload = { action: "unknown_action", installation: { id: 12345 } }

      expect { described_class.new.perform("installation", payload.to_json) }
        .not_to raise_error
    end
  end

  describe "installation_repositories event routing" do
    it "routes to InstallationRepositories handler" do
      payload = { action: "added", installation: { id: 12345 }, repositories_added: [], repositories_removed: [] }

      expect_any_instance_of(WebhookHandlers::InstallationRepositories).to receive(:call)
      described_class.new.perform("installation_repositories", payload.to_json)
    end
  end

  describe "installation-scoped webhook processing" do
    let!(:installation) { create(:github_installation, github_installation_id: 55555, status: "active") }
    let!(:repo) { create(:repo, github_owner: "octocat", github_repo: "hello-world", organization: installation.organization, github_installation: installation) }

    let(:pr_payload) do
      {
        action: "opened",
        installation: { id: 55555 },
        pull_request: {
          number: 1, title: "Test", state: "open", commits: 1,
          head: { ref: "feat" }, created_at: "2026-01-01T00:00:00Z",
          merged_at: nil, closed_at: nil,
          html_url: "https://github.com/octocat/hello-world/pull/1",
          additions: 5, deletions: 1, changed_files: 1,
          user: { login: "octocat" }
        },
        repository: { owner: { login: "octocat" }, name: "hello-world" }
      }
    end

    it "processes events from active installations" do
      expect_any_instance_of(WebhookHandlers::PrOpened).to receive(:call)
      described_class.new.perform("pull_request", pr_payload.to_json)
    end

    it "skips events from unknown installations" do
      pr_payload[:installation][:id] = 99999

      expect_any_instance_of(WebhookHandlers::PrOpened).not_to receive(:call)
      described_class.new.perform("pull_request", pr_payload.to_json)
    end

    it "skips events from suspended installations" do
      installation.update!(status: "suspended")

      expect_any_instance_of(WebhookHandlers::PrOpened).not_to receive(:call)
      described_class.new.perform("pull_request", pr_payload.to_json)
    end

    it "skips events from deleted installations" do
      installation.update!(status: "deleted")

      expect_any_instance_of(WebhookHandlers::PrOpened).not_to receive(:call)
      described_class.new.perform("pull_request", pr_payload.to_json)
    end

    it "processes events with no installation field (legacy/CLI-pushed)" do
      pr_payload.delete(:installation)

      expect_any_instance_of(WebhookHandlers::PrOpened).to receive(:call)
      described_class.new.perform("pull_request", pr_payload.to_json)
    end

    it "passes installation to review handlers" do
      review_payload = {
        action: "submitted",
        installation: { id: 55555 },
        review: { state: "APPROVED" },
        pull_request: { number: 1 },
        repository: { owner: { login: "octocat" }, name: "hello-world" }
      }

      expect_any_instance_of(WebhookHandlers::ReviewSubmitted).to receive(:call)
      described_class.new.perform("pull_request_review", review_payload.to_json)
    end

    it "passes installation to check_suite handlers" do
      cs_payload = {
        action: "completed",
        installation: { id: 55555 },
        check_suite: { conclusion: "success", pull_requests: [] },
        repository: { owner: { login: "octocat" }, name: "hello-world" }
      }

      expect_any_instance_of(WebhookHandlers::CiCompleted).to receive(:call)
      described_class.new.perform("check_suite", cs_payload.to_json)
    end
  end
end
