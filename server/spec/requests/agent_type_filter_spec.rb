require "rails_helper"

# Regression tests for the agent_type query parameter — verifies it actually
# narrows the result set on metrics, metric_detail, and sessions endpoints
# across me/repo/org scopes. Without these, filter regressions are silent.
RSpec.describe "agent_type filter", type: :request do
  let(:user) { create(:user, github_username: "alice") }
  let(:session) { UserSession.create!(user: user, expires_at: 30.days.from_now) }
  let(:headers) { { "X-Ax-Session" => session.session_token } }
  let(:org) { create(:organization, slug: "testorg") }
  let(:repo) { create(:repo, organization: org) }

  before do
    create(:org_membership, organization: org, user: user, role: "member")

    5.times do |i|
      create(:coding_session,
        id: "alice-claude-#{i}",
        repo: repo,
        agent_type: "claude_code",
        pushed_by: "alice",
        ended_at: i.days.ago,
        turn_count: 3 + i)
    end

    create(:coding_session,
      id: "alice-cursor-1",
      repo: repo,
      agent_type: "cursor_cli",
      pushed_by: "alice",
      ended_at: 1.day.ago,
      turn_count: 7)
  end

  describe "GET /me/metrics/:slug" do
    it "returns only sessions matching the agent_type" do
      get "/api/v1/orgs/testorg/me/metrics/iteration-depth",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["count"]).to eq(1)
      expect(body["total_count"]).to eq(1)
    end

    it "returns all sessions without an agent_type filter" do
      get "/api/v1/orgs/testorg/me/metrics/iteration-depth",
        params: { range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["count"]).to eq(6)
    end
  end

  describe "GET /repos/:id/metrics/:slug" do
    it "filters notable sessions and stats by agent_type" do
      get "/api/v1/orgs/testorg/repos/#{repo.id}/metrics/iteration-depth",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["count"]).to eq(1)
      expect(body["notable_highest"].size).to eq(1)
    end
  end

  describe "GET /me/metrics overview" do
    it "totalSessions reflects the agent_type filter" do
      get "/api/v1/orgs/testorg/me/metrics",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["totalSessions"]).to eq(1)
    end

    it "totalSessions counts all sessions when no agent_type filter" do
      get "/api/v1/orgs/testorg/me/metrics",
        params: { range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["totalSessions"]).to eq(6)
    end
  end

  describe "GET /metrics/:slug (org-level)" do
    it "filters sessions by agent_type" do
      get "/api/v1/orgs/testorg/metrics/autonomy-score",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      puts "Org-level filter cursor: count=#{body['count']}, total_count=#{body['total_count']}"
      expect(body["count"]).to eq(1)
    end

    it "returns all sessions without an agent_type filter" do
      get "/api/v1/orgs/testorg/metrics/autonomy-score",
        params: { range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      puts "Org-level unfiltered: count=#{body['count']}"
      expect(body["count"]).to eq(6)
    end

    it "filter shrinks the count when restricted to claude_code" do
      get "/api/v1/orgs/testorg/metrics/autonomy-score",
        params: { agent_type: "claude_code", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      puts "Org-level filter claude: count=#{body['count']}"
      expect(body["count"]).to eq(5)
    end
  end

  describe "GET /metrics overview (org-level, no repo filter)" do
    it "totalSessions reflects the agent_type filter" do
      get "/api/v1/orgs/testorg/metrics",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["totalSessions"]).to eq(1)
    end

    it "totalSessions counts all sessions when no agent_type filter" do
      get "/api/v1/orgs/testorg/metrics",
        params: { range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["totalSessions"]).to eq(6)
    end

    it "session-derived metric values reflect the agent_type filter" do
      get "/api/v1/orgs/testorg/metrics",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      # iteration-depth = AVG(turn_count). Cursor session has turn_count=7,
      # claude sessions have turn_count 3..7. Filtered avg should be 7.
      expect(body.dig("metrics", "iteration-depth", "current")).to eq(7.0)
    end

    # Mirrors a multi-repo production org: many sessions across repos with
    # cursor sessions concentrated in one repo. Confirms the org-level
    # overview correctly narrows to cursor sessions when no repo filter
    # is set, rather than falling through to all sessions.
    it "narrows totalSessions across multi-repo orgs without a repo filter" do
      multi_org = create(:organization, slug: "multi")
      create(:org_membership, organization: multi_org, user: user, role: "member")
      repo_a = create(:repo, organization: multi_org)
      repo_b = create(:repo, organization: multi_org)
      repo_c = create(:repo, organization: multi_org)

      30.times do |i|
        create(:coding_session,
          id: "multi-claude-a-#{i}",
          repo: repo_a,
          agent_type: "claude_code",
          ended_at: i.hours.ago,
          turn_count: 3)
      end
      20.times do |i|
        create(:coding_session,
          id: "multi-claude-b-#{i}",
          repo: repo_b,
          agent_type: "claude_code",
          ended_at: i.hours.ago,
          turn_count: 4)
      end
      3.times do |i|
        create(:coding_session,
          id: "multi-cursor-c-#{i}",
          repo: repo_c,
          agent_type: "cursor_cli",
          ended_at: i.hours.ago,
          turn_count: 9)
      end

      get "/api/v1/orgs/multi/metrics",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["totalSessions"]).to eq(3)
      expect(body.dig("metrics", "iteration-depth", "current")).to eq(9.0)
    end
  end

  describe "GET /me/sessions" do
    it "returns only sessions matching the agent_type" do
      get "/api/v1/orgs/testorg/me/sessions",
        params: { agent_type: "cursor_cli" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["data"].size).to eq(1)
      expect(body["data"].first["agent_type"]).to eq("cursor_cli")
      expect(body["pagination"]["total"]).to eq(1)
    end
  end

  describe "unknown agent_type does not silently bypass the filter" do
    # Guards against the scenario where the dashboard ships a new agent
    # before the server is redeployed. Using parsed_agent_type's
    # known-only validation here would silently return ALL sessions
    # (the original bug). Filtering on the raw value returns zero.
    it "returns 0 sessions for an unknown agent_type" do
      get "/api/v1/orgs/testorg/metrics/autonomy-score",
        params: { agent_type: "future_agent_v2", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      expect(body["count"]).to eq(0)
    end
  end

  describe "Reproduces production claim: org metrics filter returns total when many claude sessions and no cursor sessions" do
    let(:claude_only_org) { create(:organization, slug: "claude-only-org") }
    let(:claude_only_repo) { create(:repo, organization: claude_only_org) }

    before do
      create(:org_membership, organization: claude_only_org, user: user, role: "member")
      # Create 20 claude_code sessions, no cursor sessions
      20.times do |i|
        create(:coding_session,
          id: "claude-only-#{i}",
          repo: claude_only_repo,
          agent_type: "claude_code",
          ended_at: i.hours.ago,
          message_count: 5,
          assistant_message_count: 7)
      end
    end

    it "returns 0 sessions when filtering by cursor_cli on a claude-only org" do
      get "/api/v1/orgs/claude-only-org/metrics/autonomy-score",
        params: { agent_type: "cursor_cli", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      puts "Cursor filter on claude-only org: count=#{body['count']}, total_count=#{body['total_count']}"
      expect(body["count"]).to eq(0)
    end

    it "returns 20 sessions when filtering by claude_code on a claude-only org" do
      get "/api/v1/orgs/claude-only-org/metrics/autonomy-score",
        params: { agent_type: "claude_code", range: "30d" },
        headers: headers

      body = JSON.parse(response.body)
      puts "Claude filter: count=#{body['count']}, total_count=#{body['total_count']}"
      expect(body["count"]).to eq(20)
    end
  end
end
