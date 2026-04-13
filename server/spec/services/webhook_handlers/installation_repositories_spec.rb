require "rails_helper"

RSpec.describe WebhookHandlers::InstallationRepositories do
  let(:org) { create(:organization) }
  let!(:installation) { create(:github_installation, github_installation_id: 12345, organization: org) }

  describe "repositories_added" do
    let(:payload) do
      {
        action: "added",
        installation: { id: 12345 },
        repositories_added: [
          { id: 1, full_name: "my-org/repo-a" },
          { id: 2, full_name: "my-org/repo-b" }
        ],
        repositories_removed: []
      }
    end

    it "creates repos scoped to the installation's org" do
      expect { described_class.new(payload).call }
        .to change(Repo, :count).by(2)

      repo = Repo.find_by(github_owner: "my-org", github_repo: "repo-a")
      expect(repo.organization).to eq(org)
      expect(repo.github_installation).to eq(installation)
      expect(repo.path).to eq("my-org/repo-a")
    end

    it "updates existing org-scoped repos to attach them to the installation" do
      existing = create(:repo,
        github_owner: "my-org",
        github_repo: "repo-a",
        path: "my-org/repo-a",
        organization: org,
        github_installation: nil
      )

      expect { described_class.new(payload).call }
        .to change(Repo, :count).by(1) # only repo-b is new

      existing.reload
      expect(existing.organization).to eq(org)
      expect(existing.github_installation).to eq(installation)
    end
  end

  describe "repositories_removed" do
    let!(:repo) do
      create(:repo,
        github_owner: "my-org",
        github_repo: "repo-a",
        path: "my-org/repo-a",
        organization: org,
        github_installation: installation
      )
    end

    let(:payload) do
      {
        action: "removed",
        installation: { id: 12345 },
        repositories_added: [],
        repositories_removed: [
          { id: 1, full_name: "my-org/repo-a" }
        ]
      }
    end

    it "detaches the repo from the installation" do
      described_class.new(payload).call

      expect(repo.reload.github_installation_id).to be_nil
    end

    it "does not destroy the repo" do
      expect { described_class.new(payload).call }
        .not_to change(Repo, :count)
    end

    it "is a no-op for unknown repos" do
      payload[:repositories_removed] = [ { id: 999, full_name: "my-org/unknown" } ]

      expect { described_class.new(payload).call }
        .not_to change { repo.reload.github_installation_id }
    end
  end

  it "is a no-op for an unknown installation" do
    payload = {
      action: "added",
      installation: { id: 99999 },
      repositories_added: [ { id: 1, full_name: "my-org/repo-a" } ],
      repositories_removed: []
    }

    expect { described_class.new(payload).call }
      .not_to change(Repo, :count)
  end
end
