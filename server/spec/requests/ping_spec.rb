require "rails_helper"

RSpec.describe "Ping API", type: :request do
  let(:user) { create(:user) }
  let!(:raw_key) { ApiKey.generate_for(user) }

  it "requires authentication" do
    get "/api/v1/ping"

    expect(response).to have_http_status(:unauthorized)
  end

  it "returns ok with valid API key" do
    get "/api/v1/ping",
      headers: { "Authorization" => "Bearer #{raw_key}" }

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body["status"]).to eq("ok")
  end
end
