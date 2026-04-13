require "rails_helper"

RSpec.describe WebhookHandlers::InstallationSuspend do
  let!(:installation) { create(:github_installation, github_installation_id: 12345, status: "active") }

  let(:payload) do
    {
      action: "suspend",
      installation: { id: 12345 }
    }
  end

  it "marks the installation as suspended" do
    described_class.new(payload).call

    expect(installation.reload.status).to eq("suspended")
  end

  it "is a no-op for an unknown installation" do
    payload[:installation][:id] = 99999

    expect { described_class.new(payload).call }
      .not_to change { installation.reload.status }
  end
end
