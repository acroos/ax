require "rails_helper"

RSpec.describe WebhookHandlers::InstallationDeleted do
  let!(:installation) { create(:github_installation, github_installation_id: 12345, status: "active") }
  let!(:repo) { create(:repo, github_installation: installation, organization: installation.organization) }

  let(:payload) do
    {
      action: "deleted",
      installation: { id: 12345 }
    }
  end

  it "marks the installation as deleted" do
    described_class.new(payload).call

    expect(installation.reload.status).to eq("deleted")
  end

  it "detaches repos from the installation" do
    described_class.new(payload).call

    expect(repo.reload.github_installation_id).to be_nil
  end

  it "does not destroy the repo" do
    expect { described_class.new(payload).call }
      .not_to change(Repo, :count)
  end

  it "is a no-op for an unknown installation" do
    payload[:installation][:id] = 99999

    expect { described_class.new(payload).call }
      .not_to change { installation.reload.status }
  end
end
