require "rails_helper"

RSpec.describe MetricsComputer do
  let(:repo) { create(:repo) }
  let(:pr) { create(:pr, repo: repo, additions: 20, deletions: 5) }

  describe "#call" do
    it "returns a hash of computed metrics" do
      result = described_class.new(pr).call
      expect(result).to have_key(:line_revisit_rate)
      expect(result).to have_key(:ci_success_rate)
      expect(result.keys).to contain_exactly(:line_revisit_rate, :ci_success_rate)
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
end
