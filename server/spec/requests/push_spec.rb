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
end
