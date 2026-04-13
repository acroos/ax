require "rails_helper"

RSpec.describe WebhookHandlers::InstallationUnsuspend do
  let!(:installation) { create(:github_installation, github_installation_id: 12345, status: "suspended") }

  let(:payload) do
    {
      action: "unsuspend",
      installation: { id: 12345 }
    }
  end

  it "marks the installation as active" do
    described_class.new(payload).call

    expect(installation.reload.status).to eq("active")
  end

  it "is a no-op for an unknown installation" do
    payload[:installation][:id] = 99999

    expect { described_class.new(payload).call }
      .not_to change { installation.reload.status }
  end
end
