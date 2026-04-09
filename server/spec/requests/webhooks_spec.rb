require "rails_helper"

RSpec.describe "Webhooks", type: :request do
  let(:payload) do
    {
      action: "opened",
      pull_request: {
        number: 1,
        title: "Test",
        state: "open",
        commits: 1,
        head: { ref: "test" },
        created_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/owner/repo/pull/1",
        user: { login: "dev" }
      },
      repository: {
        owner: { login: "owner" },
        name: "repo"
      }
    }.to_json
  end

  it "accepts a webhook without secret configured" do
    post "/webhooks/github",
      params: payload,
      headers: {
        "Content-Type" => "application/json",
        "X-GitHub-Event" => "pull_request"
      }

    expect(response).to have_http_status(:ok)
  end

  it "rejects invalid signature when secret is configured" do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("AX_WEBHOOK_GITHUB_SECRET").and_return("secret123")

    post "/webhooks/github",
      params: payload,
      headers: {
        "Content-Type" => "application/json",
        "X-GitHub-Event" => "pull_request",
        "X-Hub-Signature-256" => "sha256=invalid"
      }

    expect(response).to have_http_status(:unauthorized)
  end

  it "accepts valid signature when secret is configured" do
    secret = "secret123"
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("AX_WEBHOOK_GITHUB_SECRET").and_return(secret)

    signature = "sha256=" + OpenSSL::HMAC.hexdigest("sha256", secret, payload)

    post "/webhooks/github",
      params: payload,
      headers: {
        "Content-Type" => "application/json",
        "X-GitHub-Event" => "pull_request",
        "X-Hub-Signature-256" => signature
      }

    expect(response).to have_http_status(:ok)
  end
end
