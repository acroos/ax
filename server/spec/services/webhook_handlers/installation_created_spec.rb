require "rails_helper"

RSpec.describe WebhookHandlers::InstallationCreated do
  let(:org) { create(:organization) }

  let(:payload) do
    {
      action: "created",
      installation: {
        id: 12345,
        account: { login: "my-org", type: "Organization" },
        target_type: "Organization",
        repository_selection: "all",
        permissions: { contents: "read", metadata: "read", pull_requests: "read" },
        events: %w[pull_request pull_request_review check_suite]
      }
    }
  end

  it "creates a new GithubInstallation when none exists" do
    expect { described_class.new(payload).call }
      .to change(GithubInstallation, :count).by(1)

    installation = GithubInstallation.find_by(github_installation_id: 12345)
    expect(installation.account_login).to eq("my-org")
    expect(installation.account_type).to eq("Organization")
    expect(installation.status).to eq("active")
    expect(installation.repository_selection).to eq("all")
    expect(installation.organization).to be_nil
  end

  it "is idempotent when the callback already created the row" do
    existing = create(:github_installation,
      github_installation_id: 12345,
      organization: org,
      account_login: "my-org",
      account_type: "Organization",
      target_type: "Organization",
      repository_selection: "all",
      installed_at: 1.hour.ago,
      status: "active"
    )

    expect { described_class.new(payload).call }
      .not_to change(GithubInstallation, :count)

    existing.reload
    expect(existing.organization).to eq(org)
    expect(existing.status).to eq("active")
  end

  it "does not overwrite organization_id set by the callback" do
    create(:github_installation,
      github_installation_id: 12345,
      organization: org,
      account_login: "my-org",
      account_type: "Organization",
      target_type: "Organization",
      repository_selection: "all",
      status: "active"
    )

    described_class.new(payload).call

    installation = GithubInstallation.find_by(github_installation_id: 12345)
    expect(installation.organization).to eq(org)
  end

  it "preserves existing installed_at timestamp" do
    original_time = 2.hours.ago
    create(:github_installation,
      github_installation_id: 12345,
      organization: org,
      account_login: "my-org",
      account_type: "Organization",
      target_type: "Organization",
      repository_selection: "all",
      installed_at: original_time,
      status: "active"
    )

    described_class.new(payload).call

    installation = GithubInstallation.find_by(github_installation_id: 12345)
    expect(installation.installed_at).to be_within(1.second).of(original_time)
  end
end
