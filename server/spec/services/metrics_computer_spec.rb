require "rails_helper"

RSpec.describe MetricsComputer do
  let(:repo) { create(:repo) }
  let(:pr) { create(:pr, repo: repo, additions: 20, deletions: 5) }

  describe "#call" do
    it "returns a hash of computed metrics" do
      result = described_class.new(pr).call
      expect(result).to have_key(:line_revisit_rate)
      expect(result).to have_key(:ci_success_rate)
      expect(result).to have_key(:cache_hit_rate)
    end
  end

  describe "line_revisit_rate" do
    it "returns nil when PR has no files" do
      result = described_class.new(pr).call
      expect(result[:line_revisit_rate]).to be_nil
    end

    it "returns 0.0 when no other finalized PRs exist" do
      create(:pr_file, pr: pr, filename: "src/app.rb")

      result = described_class.new(pr).call
      expect(result[:line_revisit_rate]).to eq(0.0)
    end

    it "computes revisit rate based on files shared with recently finalized PRs" do
      # Create a recently merged PR that touched src/app.rb
      older_pr = create(:pr, repo: repo, merged_at: 2.days.ago)
      create(:pr_metrics, pr: older_pr, metrics_finalized: true, finalized_at: 2.days.ago)
      create(:pr_file, pr: older_pr, filename: "src/app.rb")
      create(:pr_file, pr: older_pr, filename: "src/old.rb")

      # Current PR touches src/app.rb (revisited) and src/new.rb (new)
      create(:pr_file, pr: pr, filename: "src/app.rb")
      create(:pr_file, pr: pr, filename: "src/new.rb")

      result = described_class.new(pr).call
      # 1 revisited file out of 2 total = 0.5
      expect(result[:line_revisit_rate]).to eq(0.5)
    end

    it "counts multiple revisited files correctly" do
      older_pr = create(:pr, repo: repo, merged_at: 3.days.ago)
      create(:pr_metrics, pr: older_pr, metrics_finalized: true, finalized_at: 3.days.ago)
      create(:pr_file, pr: older_pr, filename: "src/app.rb")
      create(:pr_file, pr: older_pr, filename: "src/utils.rb")

      create(:pr_file, pr: pr, filename: "src/app.rb")
      create(:pr_file, pr: pr, filename: "src/utils.rb")
      create(:pr_file, pr: pr, filename: "src/new.rb")

      result = described_class.new(pr).call
      # 2 revisited out of 3 total
      expect(result[:line_revisit_rate]).to be_within(0.01).of(0.667)
    end

    it "excludes PRs outside the 7-day lookback window" do
      old_pr = create(:pr, repo: repo, merged_at: 10.days.ago)
      create(:pr_metrics, pr: old_pr, metrics_finalized: true, finalized_at: 10.days.ago)
      create(:pr_file, pr: old_pr, filename: "src/app.rb")

      create(:pr_file, pr: pr, filename: "src/app.rb")

      result = described_class.new(pr).call
      expect(result[:line_revisit_rate]).to eq(0.0)
    end

    it "includes closed (not merged) PRs within the lookback window" do
      closed_pr = create(:pr, repo: repo, state: "closed", closed_at: 3.days.ago)
      create(:pr_metrics, pr: closed_pr, metrics_finalized: true, finalized_at: 3.days.ago)
      create(:pr_file, pr: closed_pr, filename: "src/app.rb")

      create(:pr_file, pr: pr, filename: "src/app.rb")

      result = described_class.new(pr).call
      expect(result[:line_revisit_rate]).to eq(1.0)
    end

    it "ignores non-finalized PRs" do
      # Create an open PR (not finalized)
      open_pr = create(:pr, repo: repo, state: "open")
      create(:pr_metrics, pr: open_pr, metrics_finalized: false)
      create(:pr_file, pr: open_pr, filename: "src/app.rb")

      create(:pr_file, pr: pr, filename: "src/app.rb")

      result = described_class.new(pr).call
      expect(result[:line_revisit_rate]).to eq(0.0)
    end
  end

  describe "cache_hit_rate" do
    it "returns nil when no correlated sessions" do
      result = described_class.new(pr).call
      expect(result[:cache_hit_rate]).to be_nil
    end

    it "computes ratio of cache reads to total input tokens" do
      session = create(:coding_session, repo: repo, branch: pr.branch,
        input_tokens: 1000, cache_creation_input_tokens: 200, cache_read_input_tokens: 800)
      create(:session_pr, session_id: session.id, pr: pr)

      result = described_class.new(pr).call
      # 800 / (1000 + 200 + 800) = 0.4
      expect(result[:cache_hit_rate]).to be_within(0.001).of(0.4)
    end

    it "returns nil when total input tokens is zero" do
      session = create(:coding_session, repo: repo, branch: pr.branch,
        input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0)
      create(:session_pr, session_id: session.id, pr: pr)

      result = described_class.new(pr).call
      expect(result[:cache_hit_rate]).to be_nil
    end
  end

  describe "sidechain_rate" do
    it "returns nil when no correlated sessions" do
      result = described_class.new(pr).call
      expect(result[:sidechain_rate]).to be_nil
    end

    it "computes ratio of sidechain messages to total messages" do
      session = create(:coding_session, repo: repo, branch: pr.branch,
        message_count: 10, assistant_message_count: 15, sidechain_messages: 5)
      create(:session_pr, session_id: session.id, pr: pr)

      result = described_class.new(pr).call
      # 5 / (10 + 15) = 0.2
      expect(result[:sidechain_rate]).to be_within(0.001).of(0.2)
    end

    it "sums across multiple sessions" do
      s1 = create(:coding_session, repo: repo, branch: pr.branch,
        message_count: 10, assistant_message_count: 10, sidechain_messages: 2)
      s2 = create(:coding_session, repo: repo, branch: pr.branch,
        message_count: 5, assistant_message_count: 5, sidechain_messages: 3)
      create(:session_pr, session_id: s1.id, pr: pr)
      create(:session_pr, session_id: s2.id, pr: pr)

      result = described_class.new(pr).call
      # 5 / (15 + 15) = 0.1667
      expect(result[:sidechain_rate]).to be_within(0.001).of(0.167)
    end
  end

  describe "re_read_rate" do
    it "returns nil when no correlated sessions" do
      result = described_class.new(pr).call
      expect(result[:re_read_rate]).to be_nil
    end

    it "computes ratio of total reads to unique files read" do
      session = create(:coding_session, repo: repo, branch: pr.branch,
        total_file_reads: 20, files_read_count: 10)
      create(:session_pr, session_id: session.id, pr: pr)

      result = described_class.new(pr).call
      # 20 / 10 = 2.0
      expect(result[:re_read_rate]).to eq(2.0)
    end

    it "returns nil when no files were read" do
      session = create(:coding_session, repo: repo, branch: pr.branch,
        total_file_reads: 0, files_read_count: 0)
      create(:session_pr, session_id: session.id, pr: pr)

      result = described_class.new(pr).call
      expect(result[:re_read_rate]).to be_nil
    end
  end

  describe "autonomy_score" do
    it "returns nil when no correlated sessions" do
      result = described_class.new(pr).call
      expect(result[:autonomy_score]).to be_nil
    end

    it "computes ratio of assistant to human messages" do
      session = create(:coding_session, repo: repo, branch: pr.branch,
        message_count: 5, assistant_message_count: 20)
      create(:session_pr, session_id: session.id, pr: pr)

      result = described_class.new(pr).call
      # 20 / 5 = 4.0
      expect(result[:autonomy_score]).to eq(4.0)
    end

    it "returns nil when no human messages" do
      session = create(:coding_session, repo: repo, branch: pr.branch,
        message_count: 0, assistant_message_count: 10)
      create(:session_pr, session_id: session.id, pr: pr)

      result = described_class.new(pr).call
      expect(result[:autonomy_score]).to be_nil
    end
  end
end
