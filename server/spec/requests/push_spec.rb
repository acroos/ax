require "rails_helper"

RSpec.describe "Push API", type: :request do
  let(:user) { create(:user) }
  let!(:raw_key) { ApiKey.generate_for(user) }

  let(:push_payload) do
    {
      repo_path: "/home/user/project",
      remote_url: "https://github.com/owner/repo.git",
      owner: "owner",
      repo: "repo",
      prs: [
        {
          number: 1,
          title: "Test PR",
          branch: "test",
          state: "open",
          created_at: "2026-01-01T00:00:00Z",
          url: "https://github.com/owner/repo/pull/1",
          additions: 10,
          deletions: 5,
          changed_files: 2
        }
      ],
      commits: [],
      sessions: [],
      session_prs: [],
      pr_metrics: []
    }
  end

  it "requires authentication" do
    post "/api/v1/push", params: push_payload, as: :json

    expect(response).to have_http_status(:unauthorized)
  end

  it "rejects oversized payloads" do
    stub_const("Api::V1::PushController::MAX_PAYLOAD_SIZE", 1.byte)

    post "/api/v1/push",
      params: push_payload,
      headers: { "Authorization" => "Bearer #{raw_key}" },
      as: :json

    expect(response).to have_http_status(:payload_too_large)
    body = JSON.parse(response.body)
    expect(body["ok"]).to be false
  end

  it "accepts a valid push payload" do
    post "/api/v1/push",
      params: push_payload,
      headers: { "Authorization" => "Bearer #{raw_key}" },
      as: :json

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body["ok"]).to be true
    expect(body["entities"]["repos"]).to eq(1)
    expect(body["entities"]["prs"]).to eq(1)
  end

  it "persists all session fields including tool call metrics" do
    payload = push_payload.merge(
      sessions: [
        {
          id: "sess-tool-test",
          branch: "main",
          started_at: 1_700_000_000_000,
          ended_at: 1_700_003_600_000,
          message_count: 5,
          turn_count: 4,
          input_tokens: 1000,
          output_tokens: 2000,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 800,
          total_cost_usd: 0.42,
          primary_model: "claude-sonnet-4-20250514",
          files_read_count: 10,
          files_modified_count: 3,
          assistant_message_count: 8,
          sidechain_messages: 2,
          total_file_reads: 15,
          peak_context_pct: 0.72,
          total_tool_calls: 60,
          agent_tool_calls: 12,
          skill_tool_calls: 5,
          mcp_tool_calls: 7
        }
      ]
    )

    post "/api/v1/push",
      params: payload,
      headers: { "Authorization" => "Bearer #{raw_key}" },
      as: :json

    expect(response).to have_http_status(:ok)

    session = CodingSession.find("sess-tool-test")
    expect(session.peak_context_pct).to be_within(0.01).of(0.72)
    expect(session.total_tool_calls).to eq(60)
    expect(session.agent_tool_calls).to eq(12)
    expect(session.skill_tool_calls).to eq(5)
    expect(session.mcp_tool_calls).to eq(7)
  end
end
