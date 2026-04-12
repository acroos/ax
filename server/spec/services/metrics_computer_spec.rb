require "rails_helper"

RSpec.describe MetricsComputer do
  let(:repo) { create(:repo) }
  let(:pr) { create(:pr, repo: repo, additions: 20, deletions: 5) }

  describe "#call" do
    it "returns a hash of computed metrics" do
      result = described_class.new(pr).call
      expect(result).to have_key(:diff_churn_lines)
      expect(result).to have_key(:has_tests)
      expect(result).to have_key(:line_revisit_rate)
    end
  end

  describe "diff_churn_lines" do
    it "computes churn as total commit additions minus PR net additions" do
      create(:commit, repo: repo, pr: pr, additions: 15, deletions: 2)
      create(:commit, repo: repo, pr: pr, additions: 10, deletions: 1)
      # total_added = 25, net_added = 20, churn = 5

      result = described_class.new(pr).call
      expect(result[:diff_churn_lines]).to eq(5)
    end

    it "returns 0 when total additions equal net additions" do
      create(:commit, repo: repo, pr: pr, additions: 20, deletions: 5)

      result = described_class.new(pr).call
      expect(result[:diff_churn_lines]).to eq(0)
    end

    it "floors at 0 when net additions exceed total" do
      # This can happen if commits were squashed or rebased
      create(:commit, repo: repo, pr: pr, additions: 10, deletions: 0)

      result = described_class.new(pr).call
      expect(result[:diff_churn_lines]).to eq(0)
    end

    it "returns 0 when there are no commits" do
      result = described_class.new(pr).call
      expect(result[:diff_churn_lines]).to eq(0)
    end
  end

  describe "has_tests" do
    it "returns true when PR includes test files" do
      create(:pr_file, pr: pr, filename: "src/app.test.ts")
      create(:pr_file, pr: pr, filename: "src/app.ts")

      result = described_class.new(pr).call
      expect(result[:has_tests]).to be true
    end

    it "detects various test file patterns" do
      test_filenames = [
        "src/app.test.ts",
        "src/app.spec.js",
        "internal/db/db_test.go",
        "__tests__/app.test.tsx",
        "test/integration.js",
        "tests/unit/helper.rb"
      ]

      test_filenames.each do |filename|
        pr = create(:pr, repo: repo)
        create(:pr_file, pr: pr, filename: filename)

        result = described_class.new(pr).call
        expect(result[:has_tests]).to be(true), "Expected #{filename} to be detected as test file"
      end
    end

    it "returns false when no test files are present" do
      create(:pr_file, pr: pr, filename: "src/app.rb")
      create(:pr_file, pr: pr, filename: "lib/utils.rb")

      result = described_class.new(pr).call
      expect(result[:has_tests]).to be false
    end

    it "returns false when there are no files" do
      result = described_class.new(pr).call
      expect(result[:has_tests]).to be false
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

    it "computes revisit rate based on files shared with other finalized PRs" do
      # Create an older finalized PR that touched src/app.rb
      older_pr = create(:pr, repo: repo)
      create(:pr_metrics, pr: older_pr, metrics_finalized: true, finalized_at: 1.day.ago)
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
      older_pr = create(:pr, repo: repo)
      create(:pr_metrics, pr: older_pr, metrics_finalized: true, finalized_at: 1.day.ago)
      create(:pr_file, pr: older_pr, filename: "src/app.rb")
      create(:pr_file, pr: older_pr, filename: "src/utils.rb")

      create(:pr_file, pr: pr, filename: "src/app.rb")
      create(:pr_file, pr: pr, filename: "src/utils.rb")
      create(:pr_file, pr: pr, filename: "src/new.rb")

      result = described_class.new(pr).call
      # 2 revisited out of 3 total
      expect(result[:line_revisit_rate]).to be_within(0.01).of(0.667)
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
