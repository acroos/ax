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

    it "returns nil when there are no files" do
      result = described_class.new(pr).call
      expect(result[:has_tests]).to be_nil
    end

    it "returns nil when PR only touches non-testable files" do
      create(:pr_file, pr: pr, filename: "README.md")
      create(:pr_file, pr: pr, filename: ".github/workflows/ci.yml")
      create(:pr_file, pr: pr, filename: "Makefile")

      result = described_class.new(pr).call
      expect(result[:has_tests]).to be_nil
    end

    it "returns nil for config-only PRs" do
      create(:pr_file, pr: pr, filename: "package-lock.json")
      create(:pr_file, pr: pr, filename: ".editorconfig")

      result = described_class.new(pr).call
      expect(result[:has_tests]).to be_nil
    end

    it "evaluates test coverage when PR has a mix of testable and non-testable files" do
      create(:pr_file, pr: pr, filename: "README.md")
      create(:pr_file, pr: pr, filename: "src/app.rb")

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

    it "computes revisit rate based on files shared with recently finalized PRs" do
      # Create a recently merged PR that touched src/app.rb
      older_pr = create(:pr, repo: repo, merged_at: 2.days.ago.iso8601)
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
      older_pr = create(:pr, repo: repo, merged_at: 3.days.ago.iso8601)
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
      old_pr = create(:pr, repo: repo, merged_at: 10.days.ago.iso8601)
      create(:pr_metrics, pr: old_pr, metrics_finalized: true, finalized_at: 10.days.ago)
      create(:pr_file, pr: old_pr, filename: "src/app.rb")

      create(:pr_file, pr: pr, filename: "src/app.rb")

      result = described_class.new(pr).call
      expect(result[:line_revisit_rate]).to eq(0.0)
    end

    it "includes closed (not merged) PRs within the lookback window" do
      closed_pr = create(:pr, repo: repo, state: "closed", closed_at: 3.days.ago.iso8601)
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

  describe "compute_plan_metrics" do
    it "returns nil when no correlated sessions exist" do
      result = described_class.new(pr).compute_plan_metrics
      expect(result).to be_nil
    end

    it "returns nil when sessions have no planned files" do
      session = create(:coding_session, repo: repo, branch: "feature")
      create(:session_pr, coding_session: session, pr: pr)

      result = described_class.new(pr).compute_plan_metrics
      expect(result).to be_nil
    end

    it "computes plan metrics with exact path matches" do
      session = create(:coding_session, repo: repo, branch: "feature",
        planned_files: '["src/app.rb", "src/utils.rb", "src/new.rb"]')
      create(:session_pr, coding_session: session, pr: pr)

      create(:pr_file, pr: pr, filename: "src/app.rb")
      create(:pr_file, pr: pr, filename: "src/utils.rb")

      result = described_class.new(pr).compute_plan_metrics

      # 2 out of 2 actual files were planned = 1.0 coverage
      expect(result[:plan_coverage_score]).to eq(1.0)
      # 2 out of 3 planned files were changed = 0.667 deviation
      expect(result[:plan_deviation_score]).to be_within(0.01).of(0.667)
      # No unplanned files — no scope creep
      expect(result[:scope_creep_detected]).to be false
    end

    it "detects scope creep when most changes are unplanned" do
      session = create(:coding_session, repo: repo, branch: "feature",
        planned_files: '["src/app.rb"]')
      create(:session_pr, coding_session: session, pr: pr)

      create(:pr_file, pr: pr, filename: "src/app.rb")
      create(:pr_file, pr: pr, filename: "src/extra1.rb")
      create(:pr_file, pr: pr, filename: "src/extra2.rb")

      result = described_class.new(pr).compute_plan_metrics

      # 1 out of 3 actual files were planned
      expect(result[:plan_coverage_score]).to be_within(0.01).of(0.333)
      # 1 out of 1 planned files were changed = 1.0
      expect(result[:plan_deviation_score]).to eq(1.0)
      # 2/3 unplanned > 0.5 → scope creep
      expect(result[:scope_creep_detected]).to be true
    end

    it "handles fuzzy path matching (partial paths)" do
      session = create(:coding_session, repo: repo, branch: "feature",
        planned_files: '["db.go"]')
      create(:session_pr, coding_session: session, pr: pr)

      create(:pr_file, pr: pr, filename: "internal/db/db.go")

      result = described_class.new(pr).compute_plan_metrics

      expect(result[:plan_coverage_score]).to eq(1.0)
      expect(result[:plan_deviation_score]).to eq(1.0)
    end

    it "ignores lock files in actual files" do
      session = create(:coding_session, repo: repo, branch: "feature",
        planned_files: '["src/app.rb"]')
      create(:session_pr, coding_session: session, pr: pr)

      create(:pr_file, pr: pr, filename: "src/app.rb")
      create(:pr_file, pr: pr, filename: "package-lock.json")

      result = described_class.new(pr).compute_plan_metrics

      # package-lock.json is ignored, so 1/1 actual = 1.0
      expect(result[:plan_coverage_score]).to eq(1.0)
    end

    it "creates a PlanAnalysis record" do
      session = create(:coding_session, repo: repo, branch: "feature",
        planned_files: '["src/app.rb"]')
      create(:session_pr, coding_session: session, pr: pr)
      create(:pr_file, pr: pr, filename: "src/app.rb")

      expect {
        described_class.new(pr).compute_plan_metrics
      }.to change { PlanAnalysis.count }.by(1)

      analysis = PlanAnalysis.find_by(pr: pr)
      expect(analysis.coverage_score).to eq(1.0)
    end
  end
end
