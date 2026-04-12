require "rails_helper"

RSpec.describe GithubApp::InstallationToken do
  let(:installation_id) { 987654 }
  let(:app_id) { "12345" }
  let(:private_key) { OpenSSL::PKey::RSA.generate(2048) }
  let(:fake_token) { "ghs_fake_installation_token_abc123" }

  let(:memory_store) { ActiveSupport::Cache::MemoryStore.new }

  before do
    allow(Rails).to receive(:cache).and_return(memory_store)
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("GITHUB_APP_ID").and_return(app_id)
    allow(ENV).to receive(:fetch).with("GITHUB_APP_PRIVATE_KEY").and_return(private_key.to_pem)

    stub_request(:post, "https://api.github.com/app/installations/#{installation_id}/access_tokens")
      .to_return(
        status: 201,
        body: { token: fake_token, expires_at: 1.hour.from_now.iso8601 }.to_json,
        headers: { "Content-Type" => "application/json" }
      )
  end

  describe ".mint" do
    it "requests a new installation access token from GitHub" do
      token = described_class.mint(installation_id)
      expect(token).to eq(fake_token)
    end

    it "sends a JWT in the Authorization header" do
      described_class.mint(installation_id)

      expect(WebMock).to have_requested(:post, "https://api.github.com/app/installations/#{installation_id}/access_tokens")
        .with { |req| req.headers["Authorization"]&.start_with?("Bearer ey") }
    end
  end

  describe ".fetch" do
    it "returns the token" do
      token = described_class.fetch(installation_id)
      expect(token).to eq(fake_token)
    end

    it "caches the token on subsequent calls" do
      described_class.fetch(installation_id)
      described_class.fetch(installation_id)

      expect(WebMock).to have_requested(:post, "https://api.github.com/app/installations/#{installation_id}/access_tokens").once
    end

    it "uses the installation ID in the cache key" do
      described_class.fetch(installation_id)
      expect(Rails.cache.read("github_installation_token:#{installation_id}")).to eq(fake_token)
    end
  end
end
