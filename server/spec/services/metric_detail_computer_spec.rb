require "rails_helper"

RSpec.describe MetricDetailComputer do
  let(:org) { create(:organization) }
  let(:repo) { create(:repo, organization: org) }

  def pr_scope
    PrMetrics.joins(pr: :repo)
      .where(repos: { organization_id: org.id }, metrics_finalized: true)
  end

  def session_scope
    CodingSession.joins(:repo)
      .where(repos: { organization_id: org.id })
  end

  describe "session metrics" do
    it "computes detail for peak-context-pct" do
      create(:coding_session, repo: repo, ended_at: 3.days.ago, peak_context_pct: 0.8)
      create(:coding_session, repo: repo, ended_at: 2.days.ago, peak_context_pct: 0.4)

      result = described_class.new("peak-context-pct",
        session_scope: session_scope, window_days: 30).call

      expect(result[:metric]).to eq("peak-context-pct")
      expect(result[:source]).to eq("session")
      expect(result[:count]).to eq(2)
      expect(result[:stats][:avg]).to be_within(0.01).of(0.6)
    end

    it "computes detail for subagent-delegation" do
      create(:coding_session, repo: repo, ended_at: 3.days.ago,
        total_tool_calls: 50, agent_tool_calls: 10)

      result = described_class.new("subagent-delegation",
        session_scope: session_scope, window_days: 30).call

      expect(result[:stats][:avg]).to be_within(0.01).of(0.2)
    end

    it "computes detail for skill-tool-usage" do
      create(:coding_session, repo: repo, ended_at: 3.days.ago,
        total_tool_calls: 100, skill_tool_calls: 5, mcp_tool_calls: 15)

      result = described_class.new("skill-tool-usage",
        session_scope: session_scope, window_days: 30).call

      # (5 + 15) / 100 = 0.2
      expect(result[:stats][:avg]).to be_within(0.01).of(0.2)
    end

    it "skips sessions with zero tool calls for ratio metrics" do
      create(:coding_session, repo: repo, ended_at: 3.days.ago,
        total_tool_calls: 0, agent_tool_calls: 0)
      create(:coding_session, repo: repo, ended_at: 2.days.ago,
        total_tool_calls: 40, agent_tool_calls: 20)

      result = described_class.new("subagent-delegation",
        session_scope: session_scope, window_days: 30).call

      # Only the second session is included (NULLIF filters the first)
      expect(result[:count]).to eq(1)
      expect(result[:stats][:avg]).to be_within(0.01).of(0.5)
    end
  end

  describe "rubber-stamp-rate" do
    it "computes detail for rubber-stamp-rate" do
      # Rubber-stamped: diff >= 50 and merged within 5 min
      pr1 = create(:pr, repo: repo, state: "merged",
        merged_at: 3.days.ago,
        created_at_source: 3.days.ago - 2.minutes,
        additions: 40, deletions: 20)
      create(:pr_metrics, pr: pr1, metrics_finalized: true)

      # Not rubber-stamped
      pr2 = create(:pr, repo: repo, state: "merged",
        merged_at: 2.days.ago,
        created_at_source: 4.days.ago,
        additions: 80, deletions: 30)
      create(:pr_metrics, pr: pr2, metrics_finalized: true)

      result = described_class.new("rubber-stamp-rate",
        pr_scope: pr_scope, window_days: 30).call

      expect(result[:source]).to eq("pr")
      expect(result[:count]).to eq(2)
      expect(result[:stats][:avg]).to be_within(0.01).of(0.5)
    end
  end

  describe "task-cycle-time" do
    it "computes detail for task-cycle-time" do
      pr = create(:pr, repo: repo, state: "merged", merged_at: 2.days.ago)
      create(:pr_metrics, pr: pr, metrics_finalized: true)

      session = create(:coding_session, repo: repo,
        started_at: 4.days.ago, ended_at: 3.days.ago)
      create(:session_pr, coding_session: session, pr: pr)

      result = described_class.new("task-cycle-time",
        pr_scope: pr_scope, window_days: 30).call

      expect(result[:source]).to eq("pr")
      expect(result[:count]).to eq(1)
      # ~48 hours from session start to merge
      expect(result[:stats][:avg]).to be_within(2.0).of(48.0)
    end

    it "uses earliest session when multiple sessions are linked" do
      pr = create(:pr, repo: repo, state: "merged", merged_at: 2.days.ago)
      create(:pr_metrics, pr: pr, metrics_finalized: true)

      early = create(:coding_session, repo: repo,
        started_at: 5.days.ago, ended_at: 4.days.ago)
      late = create(:coding_session, repo: repo,
        started_at: 3.days.ago, ended_at: 2.days.ago - 1.hour)
      create(:session_pr, coding_session: early, pr: pr)
      create(:session_pr, coding_session: late, pr: pr)

      result = described_class.new("task-cycle-time",
        pr_scope: pr_scope, window_days: 30).call

      # Should use the earlier session start (5 days ago) → ~72 hours
      expect(result[:stats][:avg]).to be_within(2.0).of(72.0)
    end
  end

  describe "pr-throughput" do
    it "computes per-contributor throughput" do
      3.times do
        pr = create(:pr, repo: repo, state: "merged",
          merged_at: 5.days.ago, author: "alice")
        create(:pr_metrics, pr: pr, metrics_finalized: true)
      end
      1.times do
        pr = create(:pr, repo: repo, state: "merged",
          merged_at: 5.days.ago, author: "bob")
        create(:pr_metrics, pr: pr, metrics_finalized: true)
      end

      result = described_class.new("pr-throughput",
        pr_scope: pr_scope, window_days: 30).call

      weeks = 30.0 / 7.0
      # alice: 3/weeks, bob: 1/weeks. avg = (3/weeks + 1/weeks) / 2
      expected_avg = (3.0 / weeks + 1.0 / weeks) / 2.0
      expect(result[:count]).to eq(2) # 2 contributors
      expect(result[:stats][:avg]).to be_within(0.05).of(expected_avg)
    end

    it "returns empty stats when no merged PRs" do
      result = described_class.new("pr-throughput",
        pr_scope: pr_scope, window_days: 30).call

      expect(result[:count]).to eq(0)
      expect(result[:stats]).to be_nil
    end
  end

  describe "existing metrics still work" do
    it "computes detail for post-open-commits" do
      pr = create(:pr, repo: repo, state: "merged", merged_at: 3.days.ago)
      create(:pr_metrics, pr: pr, metrics_finalized: true, post_open_commits: 5)

      result = described_class.new("post-open-commits",
        pr_scope: pr_scope, window_days: 30).call

      expect(result[:stats][:avg]).to be_within(0.01).of(5.0)
    end

    it "computes detail for autonomy-score" do
      create(:coding_session, repo: repo, ended_at: 3.days.ago,
        message_count: 10, assistant_message_count: 20)

      result = described_class.new("autonomy-score",
        session_scope: session_scope, window_days: 30).call

      expect(result[:stats][:avg]).to be_within(0.01).of(2.0)
    end
  end

  describe "validation" do
    it "raises for unknown metric" do
      expect {
        described_class.new("unknown-metric", pr_scope: pr_scope, window_days: 30)
      }.to raise_error(ArgumentError, /unknown metric/)
    end

    it "raises for invalid window" do
      expect {
        described_class.new("post-open-commits", pr_scope: pr_scope, window_days: 15)
      }.to raise_error(ArgumentError)
    end
  end
end
