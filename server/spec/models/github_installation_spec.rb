require "rails_helper"

RSpec.describe GithubInstallation, type: :model do
  describe "validations" do
    it "requires github_installation_id to be unique" do
      create(:github_installation, github_installation_id: 42)
      expect(build(:github_installation, github_installation_id: 42)).not_to be_valid
    end

    it "rejects unknown status values" do
      expect(build(:github_installation, status: "bogus")).not_to be_valid
    end
  end

  describe "repo linkage" do
    it "nullifies github_installation_id on repos when the installation is destroyed" do
      installation = create(:github_installation)
      repo = create(:repo, organization: installation.organization, github_installation: installation)

      installation.destroy!

      expect(repo.reload.github_installation_id).to be_nil
    end
  end
end
