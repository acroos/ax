require "rails_helper"

RSpec.describe GithubApp::StateToken do
  include ActiveSupport::Testing::TimeHelpers

  describe ".generate and .verify" do
    it "round-trips org slug and user ID" do
      token = described_class.generate(org_slug: "my-org", user_id: 42)
      decoded = described_class.verify(token)

      expect(decoded[:org]).to eq("my-org")
      expect(decoded[:user]).to eq(42)
    end

    it "raises on tampered token" do
      token = described_class.generate(org_slug: "my-org", user_id: 42)
      expect {
        described_class.verify(token + "tampered")
      }.to raise_error(ActiveSupport::MessageVerifier::InvalidSignature)
    end

    it "raises on expired token" do
      token = described_class.generate(org_slug: "my-org", user_id: 42)

      travel_to 11.minutes.from_now do
        expect {
          described_class.verify(token)
        }.to raise_error(ActiveSupport::MessageVerifier::InvalidSignature)
      end
    end
  end
end
