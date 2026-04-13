require "rails_helper"

RSpec.describe "API Keys API", type: :request do
  let(:user) { create(:user) }
  let(:session) { UserSession.create!(user: user, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }

  around do |example|
    original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    example.run
  ensure
    Rails.cache = original_cache
  end

  describe "GET /api/v1/api_key" do
    it "requires session auth" do
      get "/api/v1/api_key"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns key metadata" do
      ApiKey.generate_for(user)
      get "/api/v1/api_key", headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body).to include("created_at")
      expect(body).not_to have_key("key")
    end
  end

  describe "POST /api/v1/api_key/rotate" do
    it "requires session auth" do
      post "/api/v1/api_key/rotate"
      expect(response).to have_http_status(:unauthorized)
    end

    it "revokes the old key and returns a new one" do
      old_raw = ApiKey.generate_for(user)
      post "/api/v1/api_key/rotate", headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["key"]).to start_with("ax_k1_")
      expect(body["key"]).not_to eq(old_raw)
      expect(ApiKey.authenticate(old_raw)).to be_nil
    end

    it "populates the reveal cache" do
      ApiKey.generate_for(user)
      post "/api/v1/api_key/rotate", headers: headers

      raw_key = JSON.parse(response.body)["key"]
      cached = Rails.cache.read("api_key_reveal:#{user.id}")
      expect(cached).to eq(raw_key)
    end
  end

  describe "GET /api/v1/api_key/reveal" do
    it "requires session auth" do
      get "/api/v1/api_key/reveal"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns the key when cache is populated" do
      raw_key = ApiKey.generate_for(user)
      get "/api/v1/api_key/reveal", headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["key"]).to eq(raw_key)
    end

    it "returns null when cache is empty" do
      get "/api/v1/api_key/reveal", headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["key"]).to be_nil
    end

    it "deletes the cache entry after reading (one-time read)" do
      ApiKey.generate_for(user)

      get "/api/v1/api_key/reveal", headers: headers
      expect(JSON.parse(response.body)["key"]).to be_present

      get "/api/v1/api_key/reveal", headers: headers
      expect(JSON.parse(response.body)["key"]).to be_nil
    end
  end
end
