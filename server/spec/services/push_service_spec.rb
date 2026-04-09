require "rails_helper"

RSpec.describe PushService do
  let(:org) { create(:organization) }

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
          turn_count: 5,
          input_tokens: 5000,
          output_tokens: 3000,
          total_cost_usd: 0.50,
          primary_model: "claude-sonnet-4-20250514"
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
          messages_per_pr: 10,
          iteration_depth: 2,
          post_open_commits: 1,
          first_pass_accepted: 1,
          ci_success_rate: 1.0,
          diff_churn_lines: 5,
          has_tests: 1,
          line_revisit_rate: 0.1,
          self_correction_rate: 0.2,
          context_efficiency: 0.8,
          error_recovery_attempts: 0,
          token_cost_usd: 0.50,
          plan_coverage_score: 0.9,
          plan_deviation_score: 0.1,
          scope_creep_detected: 0,
          metrics_finalized: 1,
          finalized_at: "2026-01-02T00:00:00Z"
        }
      ],
      repo_metrics: {
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        period_type: "month",
        total_sessions: 10,
        total_tokens: 50000,
        total_cost_usd: 5.0,
        unmerged_tokens: 5000,
        unmerged_cost_usd: 0.5,
        unmerged_rate: 0.1
      }
    }
  end

  describe "#execute" do
    it "creates all entities in a single transaction" do
      result = PushService.new(push_params).execute

      expect(result[:repos]).to eq(1)
      expect(result[:prs]).to eq(1)
      expect(result[:commits]).to eq(1)
      expect(result[:sessions]).to eq(1)
      expect(result[:session_prs]).to eq(1)
      expect(result[:pr_metrics]).to eq(1)
      expect(result[:repo_metrics]).to eq(1)
    end

    it "creates the repo with correct attributes" do
      PushService.new(push_params).execute

      repo = Repo.find_by(path: "/home/user/myproject")
      expect(repo.github_owner).to eq("owner")
      expect(repo.github_repo).to eq("repo")
    end

    it "creates PR with metrics" do
      PushService.new(push_params).execute

      repo = Repo.find_by(path: "/home/user/myproject")
      pr = repo.prs.find_by(number: 42)
      expect(pr.title).to eq("Add feature")
      expect(pr.pr_metrics.messages_per_pr).to eq(10)
      expect(pr.pr_metrics.metrics_finalized).to be true
    end

    it "is idempotent on re-push" do
      PushService.new(push_params).execute
      result = PushService.new(push_params).execute

      expect(Repo.count).to eq(1)
      expect(Pr.count).to eq(1)
      expect(Commit.count).to eq(1)
      expect(result[:repos]).to eq(1)
    end

    it "skips finalized metrics on re-push" do
      PushService.new(push_params).execute

      # Modify the metrics data
      modified_params = push_params.deep_dup
      modified_params[:pr_metrics][0][:messages_per_pr] = 999

      PushService.new(modified_params).execute

      repo = Repo.find_by(path: "/home/user/myproject")
      pr = repo.prs.find_by(number: 42)
      # Should still be 10 because metrics were finalized
      expect(pr.pr_metrics.messages_per_pr).to eq(10)
    end
  end
end
