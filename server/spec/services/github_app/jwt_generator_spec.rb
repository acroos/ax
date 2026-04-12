require "rails_helper"

RSpec.describe GithubApp::JwtGenerator do
  let(:app_id) { "12345" }
  let(:private_key) { OpenSSL::PKey::RSA.generate(2048) }

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("GITHUB_APP_ID").and_return(app_id)
    allow(ENV).to receive(:fetch).with("GITHUB_APP_PRIVATE_KEY").and_return(private_key.to_pem)
  end

  describe ".generate" do
    it "returns a valid JWT string" do
      token = described_class.generate
      expect(token).to be_a(String)
      expect(token.split(".").length).to eq(3)
    end

    it "encodes the correct issuer" do
      token = described_class.generate
      decoded = JWT.decode(token, private_key.public_key, true, algorithm: "RS256")
      expect(decoded.first["iss"]).to eq(app_id.to_i)
    end

    it "sets iat to 30 seconds in the past" do
      now = Time.now
      allow(Time).to receive(:now).and_return(now)

      token = described_class.generate
      decoded = JWT.decode(token, private_key.public_key, true, algorithm: "RS256")
      expect(decoded.first["iat"]).to eq(now.to_i - 30)
    end

    it "sets exp to 9 minutes from now" do
      now = Time.now
      allow(Time).to receive(:now).and_return(now)

      token = described_class.generate
      decoded = JWT.decode(token, private_key.public_key, true, algorithm: "RS256")
      expect(decoded.first["exp"]).to eq(now.to_i + 9.minutes.to_i)
    end

    it "uses RS256 algorithm" do
      token = described_class.generate
      header = JWT.decode(token, private_key.public_key, true, algorithm: "RS256").last
      expect(header["alg"]).to eq("RS256")
    end
  end

  describe ".app_id" do
    it "returns the integer app ID from env" do
      expect(described_class.app_id).to eq(12345)
    end
  end

  describe ".private_key" do
    it "returns an RSA key" do
      expect(described_class.private_key).to be_a(OpenSSL::PKey::RSA)
    end
  end
end
