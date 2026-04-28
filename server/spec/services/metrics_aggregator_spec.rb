require "rails_helper"

RSpec.describe MetricsAggregator do
  let(:org) { create(:organization) }
  let(:repo) { create(:repo, organization: org) }

  def build_scopes
    pr_scope = PrMetrics.joins(pr: :repo)
      .where(repos: { organization_id: org.id }, metrics_finalized: true)
    session_scope = CodingSession.joins(:repo)
      .where(repos: { organization_id: org.id })
    [ pr_scope, session_scope ]
  end

  describe "#call" do
    it "returns PR-derived metrics from finalized pr_metrics" do
      pr = create(:pr, repo: repo, state: "merged", merged_at: 5.days.ago)
      create(:pr_metrics, pr: pr, metrics_finalized: true,
        post_open_commits: 3, ci_success_rate: 0.9, line_revisit_rate: 0.1)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalPRs]).to eq(1)
      expect(result[:metrics]["post-open-commits"][:current]).to be_within(0.01).of(3.0)
      expect(result[:metrics]["ci-success-rate"][:current]).to be_within(0.01).of(0.9)
      expect(result[:metrics]["line-revisit-rate"][:current]).to be_within(0.01).of(0.1)
    end

    it "returns session-derived metrics from sessions table directly" do
      create(:coding_session, repo: repo,
        ended_at: 3.days.ago,
        turn_count: 8,
        input_tokens: 1000, output_tokens: 1500, cache_creation_input_tokens: 200, cache_read_input_tokens: 800,
        message_count: 10, assistant_message_count: 15, sidechain_messages: 5,
        total_file_reads: 20, files_read_count: 10)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalSessions]).to eq(1)
      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.01).of(8.0)
      expect(result[:metrics]["token-cost-per-pr"][:current]).to be_within(0.01).of(2500)
      # cache_hit_rate = 800 / (1000 + 200 + 800) = 0.4
      expect(result[:metrics]["cache-hit-rate"][:current]).to be_within(0.01).of(0.4)
      # sidechain_rate = 5 / (10 + 15) = 0.2
      expect(result[:metrics]["sidechain-rate"][:current]).to be_within(0.01).of(0.2)
      # re_read_rate = 20 / 10 = 2.0
      expect(result[:metrics]["re-read-rate"][:current]).to be_within(0.01).of(2.0)
      # autonomy_score = 15 / 10 = 1.5
      expect(result[:metrics]["autonomy-score"][:current]).to be_within(0.01).of(1.5)
    end

    it "returns new session-derived metrics (peak context, subagent, skill/tool)" do
      create(:coding_session, repo: repo,
        ended_at: 3.days.ago,
        peak_context_pct: 0.75,
        total_tool_calls: 100, agent_tool_calls: 20,
        skill_tool_calls: 5, mcp_tool_calls: 10)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:metrics]["peak-context-pct"][:current]).to be_within(0.01).of(0.75)
      # subagent_delegation = 20 / 100 = 0.2
      expect(result[:metrics]["subagent-delegation"][:current]).to be_within(0.01).of(0.2)
      # skill_tool_usage = (5 + 10) / 100 = 0.15
      expect(result[:metrics]["skill-tool-usage"][:current]).to be_within(0.01).of(0.15)
    end

    it "returns nil for new session metrics when tool calls are zero" do
      create(:coding_session, repo: repo,
        ended_at: 3.days.ago,
        peak_context_pct: nil,
        total_tool_calls: 0, agent_tool_calls: 0,
        skill_tool_calls: 0, mcp_tool_calls: 0)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:metrics]["peak-context-pct"][:current]).to be_nil
      expect(result[:metrics]["subagent-delegation"][:current]).to be_nil
      expect(result[:metrics]["skill-tool-usage"][:current]).to be_nil
    end

    it "computes rubber-stamp-rate from prs table columns" do
      # Rubber-stamped: large diff, merged quickly
      pr1 = create(:pr, repo: repo, state: "merged",
        merged_at: 3.days.ago,
        created_at_source: 3.days.ago + 2.minutes,
        additions: 100, deletions: 20)
      pr1.update_column(:merged_at, 3.days.ago)
      pr1.update_column(:created_at_source, 3.days.ago - 2.minutes)
      create(:pr_metrics, pr: pr1, metrics_finalized: true)

      # Not rubber-stamped: large diff, took long to merge
      pr2 = create(:pr, repo: repo, state: "merged",
        merged_at: 2.days.ago,
        created_at_source: 4.days.ago,
        additions: 80, deletions: 30)
      create(:pr_metrics, pr: pr2, metrics_finalized: true)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      # pr1 = 1.0 (rubber-stamped), pr2 = 0.0 (not), avg = 0.5
      expect(result[:metrics]["rubber-stamp-rate"][:current]).to be_within(0.01).of(0.5)
    end

    it "computes task-cycle-time from session-to-PR join" do
      pr = create(:pr, repo: repo, state: "merged", merged_at: 2.days.ago)
      create(:pr_metrics, pr: pr, metrics_finalized: true)

      session = create(:coding_session, repo: repo,
        started_at: 3.days.ago,
        ended_at: 2.days.ago - 1.hour)
      create(:session_pr, coding_session: session, pr: pr)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      # Cycle time = (merged_at - session.started_at) in hours = ~24 hours
      expect(result[:metrics]["task-cycle-time"][:current]).to be_within(1.0).of(24.0)
    end

    it "returns nil task-cycle-time when no sessions are linked" do
      pr = create(:pr, repo: repo, state: "merged", merged_at: 2.days.ago)
      create(:pr_metrics, pr: pr, metrics_finalized: true)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:metrics]["task-cycle-time"][:current]).to be_nil
    end

    it "computes pr-throughput as merged PRs per contributor per week" do
      # 4 merged PRs by 2 contributors in a 30-day window
      2.times do
        pr = create(:pr, repo: repo, state: "merged",
          merged_at: 5.days.ago, author: "alice")
        create(:pr_metrics, pr: pr, metrics_finalized: true)
      end
      2.times do
        pr = create(:pr, repo: repo, state: "merged",
          merged_at: 5.days.ago, author: "bob")
        create(:pr_metrics, pr: pr, metrics_finalized: true)
      end

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      # 4 merged / 2 contributors / (30/7) weeks ≈ 0.467
      expected = 4.0 / 2.0 / (30.0 / 7.0)
      expect(result[:metrics]["pr-throughput"][:current]).to be_within(0.01).of(expected)
    end

    it "returns nil pr-throughput when no merged PRs" do
      pr = create(:pr, repo: repo, state: "closed", closed_at: 5.days.ago)
      create(:pr_metrics, pr: pr, metrics_finalized: true)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:metrics]["pr-throughput"][:current]).to be_nil
    end

    it "includes sessions without PR association" do
      # Session with no PR (orphan session)
      create(:coding_session, repo: repo,
        branch: "some-branch-with-no-pr",
        ended_at: 2.days.ago,
        turn_count: 5,
        input_tokens: 600, output_tokens: 400)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalPRs]).to eq(0)
      expect(result[:totalSessions]).to eq(1)
      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.01).of(5.0)
      expect(result[:metrics]["token-cost-per-pr"][:current]).to be_within(0.01).of(1000)
    end

    it "returns nil metrics when no data exists" do
      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalPRs]).to eq(0)
      expect(result[:totalSessions]).to eq(0)
      expect(result[:metrics]["post-open-commits"][:current]).to be_nil
      expect(result[:metrics]["iteration-depth"][:current]).to be_nil
      expect(result[:metrics]["rubber-stamp-rate"][:current]).to be_nil
      expect(result[:metrics]["task-cycle-time"][:current]).to be_nil
      expect(result[:metrics]["pr-throughput"][:current]).to be_nil
      expect(result[:metrics]["peak-context-pct"][:current]).to be_nil
    end

    it "generates sparklines with correct date bucketing" do
      create(:coding_session, repo: repo,
        ended_at: 3.days.ago,
        turn_count: 10)
      create(:coding_session, repo: repo,
        ended_at: 3.days.ago,
        turn_count: 6)
      create(:coding_session, repo: repo,
        ended_at: 1.day.ago,
        turn_count: 4)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 7).call

      sparkline = result[:metrics]["iteration-depth"][:sparkline]
      expect(sparkline).to be_an(Array)
      expect(sparkline.length).to eq(8) # 7 days + today

      # Find the bucket for 3 days ago — should be AVG(10, 6) = 8
      three_days_ago = 3.days.ago.to_date.iso8601
      bucket = sparkline.find { |p| p[:t] == three_days_ago }
      expect(bucket).not_to be_nil
      expect(bucket[:v]).to be_within(0.1).of(8.0)
    end

    it "computes prior period for deltas" do
      # Current period session
      create(:coding_session, repo: repo,
        ended_at: 2.days.ago,
        turn_count: 10)

      # Prior period session
      create(:coding_session, repo: repo,
        ended_at: 10.days.ago,
        turn_count: 5)

      pr_scope, session_scope = build_scopes

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 7).call

      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.1).of(10.0)
      expect(result[:metrics]["iteration-depth"][:prior]).to be_within(0.1).of(5.0)
    end

    it "scopes sessions by pushed_by for user-level metrics" do
      create(:coding_session, repo: repo, ended_at: 2.days.ago,
        pushed_by: "alice", turn_count: 10)
      create(:coding_session, repo: repo, ended_at: 2.days.ago,
        pushed_by: "bob", turn_count: 4)

      pr_scope = PrMetrics.joins(pr: :repo)
        .where(repos: { organization_id: org.id }, metrics_finalized: true)
      session_scope = CodingSession.joins(:repo)
        .where(repos: { organization_id: org.id })
        .where(pushed_by: "alice")

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalSessions]).to eq(1)
      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.01).of(10.0)
    end

    it "raises ArgumentError for invalid window_days" do
      pr_scope = PrMetrics.none
      session_scope = CodingSession.none

      expect {
        described_class.new(pr_scope, session_scope: session_scope, window_days: 15)
      }.to raise_error(ArgumentError)
    end
  end

  describe "agent_type capability filtering" do
    it "returns nil for unsupported metrics when agent_type=copilot_cli" do
      # copilot_cli does not support sidechain_messages or peak_context_pct
      create(:coding_session, repo: repo,
        agent_type: "copilot_cli",
        ended_at: 3.days.ago,
        turn_count: 5,
        input_tokens: 1000, output_tokens: 500,
        cache_creation_input_tokens: 100, cache_read_input_tokens: 400,
        message_count: 10, assistant_message_count: 8,
        sidechain_messages: nil,
        peak_context_pct: nil,
        total_file_reads: 20, files_read_count: 10,
        total_tool_calls: 50, agent_tool_calls: 5,
        skill_tool_calls: 0, mcp_tool_calls: 10)

      pr_scope, session_scope = build_scopes
      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30, agent_type: "copilot_cli").call

      expect(result[:metrics]["sidechain-rate"][:current]).to be_nil
      expect(result[:metrics]["sidechain-rate"][:prior]).to be_nil
      expect(result[:metrics]["sidechain-rate"][:sparkline]).to eq([])

      expect(result[:metrics]["peak-context-pct"][:current]).to be_nil
      expect(result[:metrics]["peak-context-pct"][:prior]).to be_nil
      expect(result[:metrics]["peak-context-pct"][:sparkline]).to eq([])
    end

    it "computes supported metrics normally when agent_type=copilot_cli" do
      create(:coding_session, repo: repo,
        agent_type: "copilot_cli",
        ended_at: 3.days.ago,
        turn_count: 8,
        input_tokens: 1000, output_tokens: 500,
        cache_creation_input_tokens: 200, cache_read_input_tokens: 800,
        message_count: 10, assistant_message_count: 8,
        sidechain_messages: nil,
        peak_context_pct: nil,
        total_file_reads: 20, files_read_count: 5,
        total_tool_calls: 0, agent_tool_calls: 0,
        skill_tool_calls: 0, mcp_tool_calls: 0)

      pr_scope, session_scope = build_scopes
      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30, agent_type: "copilot_cli").call

      # iteration-depth: no required fields → always computed
      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.01).of(8.0)
      # cache-hit-rate: requires input_tokens, cache_read_input_tokens, cache_creation_input_tokens — all supported
      # 800 / (1000 + 200 + 800) = 0.4
      expect(result[:metrics]["cache-hit-rate"][:current]).to be_within(0.01).of(0.4)
    end

    it "returns all 9 metric slugs with nil agent_type (no filtering)" do
      create(:coding_session, repo: repo,
        ended_at: 3.days.ago,
        turn_count: 5)

      pr_scope, session_scope = build_scopes
      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expected_slugs = MetricsAggregator::SESSION_METRIC_EXPRESSIONS.keys
      expect(result[:metrics].keys).to include(*expected_slugs)
      expect(expected_slugs.size).to eq(9)
    end

    it "always includes all session metric slugs in the response, even when filtered" do
      pr_scope, session_scope = build_scopes
      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30, agent_type: "copilot_cli").call

      MetricsAggregator::SESSION_METRIC_EXPRESSIONS.each_key do |slug|
        expect(result[:metrics]).to have_key(slug),
          "expected #{slug} to be present in metrics hash"
      end
    end
  end

  describe ".task_cycle_time_join_for" do
    # Byte-for-byte regression against the previously-hardcoded TASK_CYCLE_TIME_JOINS values.
    EXPECTED_JOIN_NIL = "LEFT JOIN (SELECT session_prs.pr_id, MIN(sessions.started_at) AS min_started FROM session_prs JOIN sessions ON sessions.id = session_prs.session_id GROUP BY session_prs.pr_id) first_sessions ON first_sessions.pr_id = prs.id"
    EXPECTED_JOIN_CLAUDE_CODE = "LEFT JOIN (SELECT session_prs.pr_id, MIN(sessions.started_at) AS min_started FROM session_prs JOIN sessions ON sessions.id = session_prs.session_id WHERE sessions.agent_type = 'claude_code' GROUP BY session_prs.pr_id) first_sessions ON first_sessions.pr_id = prs.id"
    EXPECTED_JOIN_COPILOT_CLI = "LEFT JOIN (SELECT session_prs.pr_id, MIN(sessions.started_at) AS min_started FROM session_prs JOIN sessions ON sessions.id = session_prs.session_id WHERE sessions.agent_type = 'copilot_cli' GROUP BY session_prs.pr_id) first_sessions ON first_sessions.pr_id = prs.id"

    it "produces the correct SQL for nil agent_type" do
      expect(described_class.task_cycle_time_join_for(nil)).to eq(EXPECTED_JOIN_NIL)
    end

    it "produces the correct SQL for claude_code agent_type" do
      expect(described_class.task_cycle_time_join_for("claude_code")).to eq(EXPECTED_JOIN_CLAUDE_CODE)
    end

    it "produces the correct SQL for copilot_cli agent_type" do
      expect(described_class.task_cycle_time_join_for("copilot_cli")).to eq(EXPECTED_JOIN_COPILOT_CLI)
    end

    it "falls back to the nil (no-filter) join for an unknown agent_type" do
      expect(described_class.task_cycle_time_join_for("unknown_agent")).to eq(EXPECTED_JOIN_NIL)
    end
  end
end
