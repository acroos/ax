require "rails_helper"

RSpec.describe GithubInstallation, type: :model do
  describe "validations" do
    it "is valid with required attributes" do
      expect(build(:github_installation)).to be_valid
    end

    it "requires github_installation_id" do
      installation = build(:github_installation, github_installation_id: nil)
      expect(installation).not_to be_valid
      expect(installation.errors[:github_installation_id]).to include("can't be blank")
    end

    it "requires github_installation_id to be unique" do
      create(:github_installation, github_installation_id: 42)
      duplicate = build(:github_installation, github_installation_id: 42)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:github_installation_id]).to include("has already been taken")
    end

    it "requires a valid status" do
      installation = build(:github_installation, status: "bogus")
      expect(installation).not_to be_valid
      expect(installation.errors[:status]).to include("is not included in the list")
    end

    %w[active suspended deleted].each do |valid_status|
      it "accepts #{valid_status.inspect} as a status" do
        expect(build(:github_installation, status: valid_status)).to be_valid
      end
    end

    it "requires an organization" do
      installation = build(:github_installation, organization: nil)
      expect(installation).not_to be_valid
    end
  end

  describe "associations" do
    it "belongs to an organization" do
      installation = create(:github_installation)
      expect(installation.organization).to be_present
    end

    it "allows an optional installed_by user" do
      user = create(:user)
      installation = create(:github_installation, installed_by: user)
      expect(installation.installed_by).to eq(user)
    end

    it "can be created without an installed_by user" do
      installation = create(:github_installation, installed_by: nil)
      expect(installation.installed_by).to be_nil
    end

    it "has many repos" do
      installation = create(:github_installation)
      repo = create(:repo, organization: installation.organization, github_installation: installation)
      expect(installation.reload.repos).to include(repo)
    end

    it "nullifies the repo's github_installation_id on destroy" do
      installation = create(:github_installation)
      repo = create(:repo, organization: installation.organization, github_installation: installation)
      installation.destroy!
      expect(repo.reload.github_installation_id).to be_nil
    end
  end

  describe ".active scope" do
    it "returns only active installations" do
      active    = create(:github_installation, status: "active")
      suspended = create(:github_installation, status: "suspended")
      deleted   = create(:github_installation, status: "deleted")

      expect(described_class.active).to include(active)
      expect(described_class.active).not_to include(suspended, deleted)
    end
  end

  describe "status helpers" do
    it "exposes active?, suspended?, and deleted?" do
      expect(build(:github_installation, status: "active")).to be_active
      expect(build(:github_installation, status: "suspended")).to be_suspended
      expect(build(:github_installation, status: "deleted")).to be_deleted
    end
  end
end
