require "rails_helper"

RSpec.describe ApiKey, type: :model do
  describe ".generate_for" do
    it "creates a key and returns the raw key" do
      user = create(:user)
      raw_key = ApiKey.generate_for(user)

      expect(raw_key).to start_with("ax_k1_")
      expect(raw_key.length).to eq(70) # "ax_k1_" + 64 hex chars
      expect(user.reload.api_key).to be_present
    end

    it "caches the raw key for one-time reveal" do
      original_cache = Rails.cache
      Rails.cache = ActiveSupport::Cache::MemoryStore.new

      user = create(:user)
      raw_key = ApiKey.generate_for(user)

      expect(Rails.cache.read("api_key_reveal:#{user.id}")).to eq(raw_key)
    ensure
      Rails.cache = original_cache
    end
  end

  describe ".authenticate" do
    it "returns the key when given a valid raw key" do
      user = create(:user)
      raw_key = ApiKey.generate_for(user)

      result = ApiKey.authenticate(raw_key)
      expect(result).to be_present
      expect(result.user).to eq(user)
    end

    it "returns nil for invalid key" do
      expect(ApiKey.authenticate("ax_k1_invalid")).to be_nil
    end

    it "returns nil for nil" do
      expect(ApiKey.authenticate(nil)).to be_nil
    end

    it "returns nil for revoked key" do
      user = create(:user)
      raw_key = ApiKey.generate_for(user)
      user.api_key.update!(revoked: true)

      expect(ApiKey.authenticate(raw_key)).to be_nil
    end

    it "updates last_used_at on successful auth" do
      user = create(:user)
      raw_key = ApiKey.generate_for(user)

      expect { ApiKey.authenticate(raw_key) }
        .to change { user.api_key.reload.last_used_at }
    end

    it "backfills digest for legacy keys missing key_digest" do
      user = create(:user)
      raw_key = ApiKey.generate_for(user)
      user.api_key.update_columns(key_digest: nil)

      result = ApiKey.authenticate(raw_key)
      expect(result).to be_present
      expect(result.user).to eq(user)
      expect(result.reload.key_digest).to eq(OpenSSL::Digest::SHA256.hexdigest(raw_key))
    end
  end
end
