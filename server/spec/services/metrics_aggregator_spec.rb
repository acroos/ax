require "rails_helper"

RSpec.describe MetricsAggregator do
  let(:org) { create(:organization) }
  let(:repo) { create(:repo, organization: org) }

  def epoch_ms(time)
    (time.to_f * 1000).to_i
  end

  describe "#call" do
    it "returns PR-derived metrics from finalized pr_metrics" do
      pr = create(:pr, repo: repo, state: "merged", merged_at: 5.days.ago.iso8601)
      create(:pr_metrics, pr: pr, metrics_finalized: true,
        post_open_commits: 3, ci_success_rate: 0.9, line_revisit_rate: 0.1)

      pr_scope = PrMetrics.joins(pr: :repo)
        .where(repos: { organization_id: org.id }, metrics_finalized: true)
      session_scope = CodingSession.joins(:repo)
        .where(repos: { organization_id: org.id })

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalPRs]).to eq(1)
      expect(result[:metrics]["post-open-commits"][:current]).to be_within(0.01).of(3.0)
      expect(result[:metrics]["ci-success-rate"][:current]).to be_within(0.01).of(0.9)
      expect(result[:metrics]["line-revisit-rate"][:current]).to be_within(0.01).of(0.1)
    end

    it "returns session-derived metrics from sessions table directly" do
      create(:coding_session, repo: repo,
        ended_at: epoch_ms(3.days.ago),
        turn_count: 8,
        total_cost_usd: 2.50,
        input_tokens: 1000, cache_creation_input_tokens: 200, cache_read_input_tokens: 800,
        message_count: 10, assistant_message_count: 15, sidechain_messages: 5,
        total_file_reads: 20, files_read_count: 10)

      pr_scope = PrMetrics.joins(pr: :repo)
        .where(repos: { organization_id: org.id }, metrics_finalized: true)
      session_scope = CodingSession.joins(:repo)
        .where(repos: { organization_id: org.id })

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalSessions]).to eq(1)
      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.01).of(8.0)
      expect(result[:metrics]["token-cost-per-pr"][:current]).to be_within(0.01).of(2.50)
      # cache_hit_rate = 800 / (1000 + 200 + 800) = 0.4
      expect(result[:metrics]["cache-hit-rate"][:current]).to be_within(0.01).of(0.4)
      # sidechain_rate = 5 / (10 + 15) = 0.2
      expect(result[:metrics]["sidechain-rate"][:current]).to be_within(0.01).of(0.2)
      # re_read_rate = 20 / 10 = 2.0
      expect(result[:metrics]["re-read-rate"][:current]).to be_within(0.01).of(2.0)
      # autonomy_score = 15 / 10 = 1.5
      expect(result[:metrics]["autonomy-score"][:current]).to be_within(0.01).of(1.5)
    end

    it "includes sessions without PR association" do
      # Session with no PR (orphan session)
      create(:coding_session, repo: repo,
        branch: "some-branch-with-no-pr",
        ended_at: epoch_ms(2.days.ago),
        turn_count: 5,
        total_cost_usd: 1.00)

      pr_scope = PrMetrics.joins(pr: :repo)
        .where(repos: { organization_id: org.id }, metrics_finalized: true)
      session_scope = CodingSession.joins(:repo)
        .where(repos: { organization_id: org.id })

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalPRs]).to eq(0)
      expect(result[:totalSessions]).to eq(1)
      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.01).of(5.0)
      expect(result[:metrics]["token-cost-per-pr"][:current]).to be_within(0.01).of(1.00)
    end

    it "returns nil metrics when no data exists" do
      pr_scope = PrMetrics.joins(pr: :repo)
        .where(repos: { organization_id: org.id }, metrics_finalized: true)
      session_scope = CodingSession.joins(:repo)
        .where(repos: { organization_id: org.id })

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 30).call

      expect(result[:totalPRs]).to eq(0)
      expect(result[:totalSessions]).to eq(0)
      expect(result[:metrics]["post-open-commits"][:current]).to be_nil
      expect(result[:metrics]["iteration-depth"][:current]).to be_nil
    end

    it "generates sparklines with correct date bucketing" do
      create(:coding_session, repo: repo,
        ended_at: epoch_ms(3.days.ago),
        turn_count: 10, total_cost_usd: 2.0)
      create(:coding_session, repo: repo,
        ended_at: epoch_ms(3.days.ago),
        turn_count: 6, total_cost_usd: 1.0)
      create(:coding_session, repo: repo,
        ended_at: epoch_ms(1.day.ago),
        turn_count: 4, total_cost_usd: 3.0)

      pr_scope = PrMetrics.joins(pr: :repo)
        .where(repos: { organization_id: org.id }, metrics_finalized: true)
      session_scope = CodingSession.joins(:repo)
        .where(repos: { organization_id: org.id })

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
        ended_at: epoch_ms(2.days.ago),
        turn_count: 10, total_cost_usd: 3.0)

      # Prior period session
      create(:coding_session, repo: repo,
        ended_at: epoch_ms(10.days.ago),
        turn_count: 5, total_cost_usd: 1.0)

      pr_scope = PrMetrics.joins(pr: :repo)
        .where(repos: { organization_id: org.id }, metrics_finalized: true)
      session_scope = CodingSession.joins(:repo)
        .where(repos: { organization_id: org.id })

      result = described_class.new(pr_scope, session_scope: session_scope, window_days: 7).call

      expect(result[:metrics]["iteration-depth"][:current]).to be_within(0.1).of(10.0)
      expect(result[:metrics]["iteration-depth"][:prior]).to be_within(0.1).of(5.0)
    end

    it "raises ArgumentError for invalid window_days" do
      pr_scope = PrMetrics.none
      session_scope = CodingSession.none

      expect {
        described_class.new(pr_scope, session_scope: session_scope, window_days: 15)
      }.to raise_error(ArgumentError)
    end
  end
end
