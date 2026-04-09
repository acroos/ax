require "rails_helper"

RSpec.describe OrgService do
  describe ".create_org" do
    it "creates org with owner membership" do
      user = create(:user, github_username: "testuser")
      WaitlistEntry.create!(email: "t@b.com", github_username: "testuser", status: "approved")

      org = OrgService.create_org(user, { slug: "my-team", name: "My Team" })

      expect(org).to be_persisted
      expect(org.slug).to eq("my-team")
      expect(user.role_in(org)).to eq("owner")
    end

    it "marks waitlist entry as joined" do
      user = create(:user, github_username: "testuser")
      entry = WaitlistEntry.create!(email: "t@b.com", github_username: "testuser", status: "approved")

      OrgService.create_org(user, { slug: "my-team", name: "My Team" })

      expect(entry.reload.status).to eq("joined")
    end
  end
end
