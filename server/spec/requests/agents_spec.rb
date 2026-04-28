require "rails_helper"

RSpec.describe "Agents API", type: :request do
  let(:user) { create(:user) }
  let(:user_session) { UserSession.create!(user: user, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => user_session.session_token } }

  describe "GET /api/v1/agents" do
    it "requires session auth" do
      get "/api/v1/agents"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 200 with agents payload for authenticated users" do
      get "/api/v1/agents", headers: headers
      expect(response).to have_http_status(:ok)
    end

    it "returns agents payload deep-equal to AgentRegistry::AGENTS" do
      get "/api/v1/agents", headers: headers
      body = JSON.parse(response.body)
      expect(body).to have_key("agents")
      # Verify each agent id and label are present
      AgentRegistry::AGENTS.each do |id, meta|
        expect(body["agents"]).to have_key(id)
        expect(body["agents"][id]["label"]).to eq(meta[:label])
        expect(body["agents"][id]["color"]).to eq(meta[:color])
      end
    end

    it "returns all registered agent IDs" do
      get "/api/v1/agents", headers: headers
      body = JSON.parse(response.body)
      expect(body["agents"].keys).to match_array(AgentRegistry::VALID_IDS)
    end
  end
end
