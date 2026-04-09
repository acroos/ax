require "rails_helper"

RSpec.describe Organization, type: :model do
  describe "slug validation" do
    let(:user) { create(:user) }

    it "accepts valid slugs" do
      org = build(:organization, slug: "my-org", created_by: user)
      expect(org).to be_valid
    end

    it "rejects reserved slugs" do
      org = build(:organization, slug: "admin", created_by: user)
      expect(org).not_to be_valid
      expect(org.errors[:slug]).to include("is reserved")
    end

    it "rejects consecutive hyphens" do
      org = build(:organization, slug: "my--org", created_by: user)
      expect(org).not_to be_valid
    end

    it "rejects slugs starting with number" do
      org = build(:organization, slug: "1org", created_by: user)
      expect(org).not_to be_valid
    end

    it "rejects slugs shorter than 3 chars" do
      org = build(:organization, slug: "ab", created_by: user)
      expect(org).not_to be_valid
    end
  end
end
