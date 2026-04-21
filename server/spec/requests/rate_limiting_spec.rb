require "rails_helper"

RSpec.describe "Rate limiting", type: :request, rack_attack: true do
  describe "waitlist throttle (10 req/min by IP)" do
    it "allows requests at the limit" do
      10.times { post "/waitlist", params: { email: "a@b.com" }, as: :json }

      expect(response).not_to have_http_status(:too_many_requests)
    end

    it "throttles after exceeding the limit" do
      11.times { post "/waitlist", params: { email: "a@b.com" }, as: :json }

      expect(response).to have_http_status(:too_many_requests)
    end
  end

  describe "push API throttle (30 req/min by API key)" do
    let(:user) { create(:user) }
    let!(:raw_key) { ApiKey.generate_for(user) }
    let(:headers) { { "Authorization" => "Bearer #{raw_key}" } }

    it "throttles by API key after exceeding the limit" do
      31.times do
        post "/api/v1/push", params: { repo_path: "/x" }, headers: headers, as: :json
      end

      expect(response).to have_http_status(:too_many_requests)
    end

    it "allows a different API key after one is throttled" do
      user2 = create(:user)
      raw_key2 = ApiKey.generate_for(user2)

      31.times do
        post "/api/v1/push", params: { repo_path: "/x" }, headers: headers, as: :json
      end
      expect(response).to have_http_status(:too_many_requests)

      post "/api/v1/push",
        params: { repo_path: "/x" },
        headers: { "Authorization" => "Bearer #{raw_key2}" },
        as: :json
      expect(response).not_to have_http_status(:too_many_requests)
    end
  end

  describe "auth throttle (60 req/min by IP)" do
    it "throttles /auth/me after exceeding the limit" do
      61.times { get "/auth/me" }

      expect(response).to have_http_status(:too_many_requests)
    end

    it "throttles /api/v1/api_key after exceeding the limit" do
      61.times { get "/api/v1/api_key" }

      expect(response).to have_http_status(:too_many_requests)
    end
  end

  describe "webhook throttle (120 req/min by IP)" do
    it "throttles after exceeding the limit" do
      121.times { post "/webhooks/github", params: {}, as: :json }

      expect(response).to have_http_status(:too_many_requests)
    end
  end

  describe "global fallback (300 req/min by IP)" do
    it "throttles any endpoint after 300 requests" do
      # Use /api/v1/ping — not safelisted, not covered by a specific throttle.
      # The underlying 401 doesn't matter; Rack::Attack runs first.
      301.times { get "/api/v1/ping" }

      expect(response).to have_http_status(:too_many_requests)
    end
  end

  describe "health check exclusion" do
    it "never rate limits /up" do
      350.times { get "/up" }

      expect(response).not_to have_http_status(:too_many_requests)
    end

    it "never rate limits /api/v1/health" do
      350.times { get "/api/v1/health" }

      expect(response).not_to have_http_status(:too_many_requests)
    end
  end

  describe "429 response format" do
    it "returns JSON with error message, retry_after, and Retry-After header" do
      11.times { post "/waitlist", params: { email: "x@y.com" }, as: :json }

      expect(response).to have_http_status(:too_many_requests)
      expect(response.content_type).to include("application/json")

      body = JSON.parse(response.body)
      expect(body["error"]).to match(/Rate limit exceeded/)
      expect(body["retry_after"]).to be_a(Integer)
      expect(body["retry_after"]).to be > 0
      expect(response.headers["Retry-After"].to_i).to be > 0
    end
  end
end
