require "rails_helper"

RSpec.describe PushService do
  let(:user) { create(:user) }
  let(:org) { create(:organization, created_by: user, is_personal: true) }
  let!(:membership) { create(:org_membership, user: user, organization: org, role: "owner") }

  let(:push_params) do
    {
      repo_path: "/home/user/myproject",
      remote_url: "https://github.com/owner/repo.git",
      owner: "owner",
      repo: "repo",
      prs: [
        {
          number: 42,
          title: "Add feature",
          branch: "feature/add",
          state: "merged",
          created_at: "2026-01-01T00:00:00Z",
          merged_at: "2026-01-02T00:00:00Z",
          url: "https://github.com/owner/repo/pull/42",
          additions: 100,
          deletions: 20,
          changed_files: 5
        }
      ],
      commits: [
        {
          sha: "abc123def456",
          pr_number: 42,
          message: "Add the feature",
          author: "dev",
          committed_at: "2026-01-01T12:00:00Z",
          is_claude_authored: true,
          is_post_open: false,
          additions: 50,
          deletions: 10,
          files_changed: 3
        }
      ],
      sessions: [
        {
          id: "session-001",
          branch: "feature/add",
          started_at: 1735689600000,
          ended_at: 1735693200000,
          message_count: 10,
          turn_count: 2,
          input_tokens: 5000,
          output_tokens: 3000,
          total_cost_usd: 0.50,
          primary_model: "claude-sonnet-4-20250514",
          peak_context_pct: 0.65,
          total_tool_calls: 50,
          agent_tool_calls: 8,
          skill_tool_calls: 3,
          mcp_tool_calls: 5
        }
      ],
      session_prs: [
        {
          session_id: "session-001",
          pr_number: 42,
          confidence: "high"
        }
      ],
      pr_metrics: [
        {
          pr_number: 42,
          post_open_commits: 1,
          ci_success_rate: 1.0,
          line_revisit_rate: 0.1
        }
      ]
    }
  end

  describe "#execute" do
    it "creates all entities in a single transaction" do
      result = PushService.new(push_params, user: user).execute

      expect(result[:repos]).to eq(1)
      expect(result[:prs]).to eq(1)
      expect(result[:commits]).to eq(1)
      expect(result[:sessions]).to eq(1)
      expect(result[:session_prs]).to eq(1)
      expect(result[:pr_metrics]).to eq(1)
    end

    it "creates the repo with correct attributes" do
      PushService.new(push_params, user: user).execute

      repo = Repo.find_by(path: "/home/user/myproject")
      expect(repo.platform_owner).to eq("owner")
      expect(repo.platform_repo).to eq("repo")
    end

    it "creates PR with metrics" do
      PushService.new(push_params, user: user).execute

      repo = Repo.find_by(path: "/home/user/myproject")
      pr = repo.prs.find_by(number: 42)
      expect(pr.title).to eq("Add feature")
      expect(pr.pr_metrics.post_open_commits).to eq(1)
      expect(pr.pr_metrics.ci_success_rate).to eq(1.0)
    end

    it "sets pushed_by to the pushing user's github_username" do
      PushService.new(push_params, user: user).execute

      session = CodingSession.find("session-001")
      expect(session.pushed_by).to eq(user.github_username)
    end

    it "updates pushed_by on re-push" do
      PushService.new(push_params, user: user).execute

      other_user = create(:user, github_username: "other-dev")
      create(:org_membership, user: other_user, organization: org, role: "member")

      PushService.new(push_params, user: other_user).execute

      session = CodingSession.find("session-001")
      expect(session.pushed_by).to eq("other-dev")
    end

    it "persists new session fields (tool calls and peak context)" do
      PushService.new(push_params, user: user).execute

      session = CodingSession.find("session-001")
      expect(session.peak_context_pct).to be_within(0.01).of(0.65)
      expect(session.total_tool_calls).to eq(50)
      expect(session.agent_tool_calls).to eq(8)
      expect(session.skill_tool_calls).to eq(3)
      expect(session.mcp_tool_calls).to eq(5)
    end

    it "is idempotent on re-push" do
      PushService.new(push_params, user: user).execute
      result = PushService.new(push_params, user: user).execute

      expect(Repo.count).to eq(1)
      expect(Pr.count).to eq(1)
      expect(Commit.count).to eq(1)
      expect(result[:repos]).to eq(1)
    end

    it "assigns the repo to the user's personal org" do
      PushService.new(push_params, user: user).execute

      repo = Repo.find_by(path: "/home/user/myproject")
      expect(repo.organization).to eq(org)
    end

    it "allows re-push to a repo the user's org owns" do
      PushService.new(push_params, user: user).execute
      result = PushService.new(push_params, user: user).execute

      expect(result[:repos]).to eq(1)
    end

    it "rejects push to a repo owned by another org" do
      other_org = create(:organization)
      create(:repo, path: "/home/user/myproject", organization: other_org)

      expect {
        PushService.new(push_params, user: user).execute
      }.to raise_error(PushService::Error, /not a member/)
    end

    it "skips session if ID already belongs to a different repo" do
      PushService.new(push_params, user: user).execute

      # Second repo pushing the same session ID
      other_params = push_params.deep_dup
      other_params[:repo_path] = "/home/user/otherproject"
      other_params[:owner] = "owner"
      other_params[:repo] = "other-repo"
      other_params[:sessions][0][:branch] = "main"
      other_params.delete(:prs)
      other_params.delete(:commits)
      other_params.delete(:session_prs)
      other_params.delete(:pr_metrics)

      result = PushService.new(other_params, user: user).execute

      expect(result[:sessions]).to eq(0)
      expect(CodingSession.count).to eq(1)
      # Original session remains unchanged
      session = CodingSession.find("session-001")
      expect(session.repo.path).to eq("/home/user/myproject")
    end

    it "enforces plan repo limit on new repos" do
      # Free plan allows 2 repos — create 2 existing repos to hit the limit
      create(:repo, organization: org, platform_owner: "owner", platform_repo: "existing1")
      create(:repo, organization: org, platform_owner: "owner", platform_repo: "existing2")

      expect {
        PushService.new(push_params, user: user).execute
      }.to raise_error(PushService::Error, /Plan limit reached/)
    end

    it "allows push when under plan repo limit" do
      create(:repo, organization: org, platform_owner: "owner", platform_repo: "existing1")

      result = PushService.new(push_params, user: user).execute
      expect(result[:repos]).to eq(1)
    end

    it "rejects push exceeding per-entity limits" do
      oversized_params = push_params.deep_dup
      oversized_params[:sessions] = (1..1001).map do |i|
        { id: "session-#{i}", branch: "main", started_at: 1735689600000, ended_at: 1735693200000 }
      end

      expect {
        PushService.new(oversized_params, user: user).execute
      }.to raise_error(PushService::Error, /Too many sessions: 1001 exceeds limit of 1000/)
    end

    it "strips metrics_finalized from push — only webhook handlers can finalize" do
      params_with_finalized = push_params.deep_dup
      params_with_finalized[:pr_metrics][0][:metrics_finalized] = true
      params_with_finalized[:pr_metrics][0][:finalized_at] = "2026-01-02T00:00:00Z"

      PushService.new(params_with_finalized, user: user).execute

      repo = Repo.find_by(path: "/home/user/myproject")
      pr = repo.prs.find_by(number: 42)
      expect(pr.pr_metrics.metrics_finalized).to be false
      expect(pr.pr_metrics.finalized_at).to be_nil
    end

    it "skips finalized metrics on re-push" do
      PushService.new(push_params, user: user).execute

      # Simulate webhook handler finalizing the metrics
      repo = Repo.find_by(path: "/home/user/myproject")
      pr = repo.prs.find_by(number: 42)
      pr.pr_metrics.update_columns(metrics_finalized: true, finalized_at: Time.current)

      # Re-push with modified metrics
      modified_params = push_params.deep_dup
      modified_params[:pr_metrics][0][:post_open_commits] = 999

      PushService.new(modified_params, user: user).execute

      # Should still be 1 because metrics were finalized
      expect(pr.pr_metrics.reload.post_open_commits).to eq(1)
    end
  end
end
