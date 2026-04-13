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
end
