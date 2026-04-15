require "rails_helper"

RSpec.describe SessionPrCorrelationService do
  let(:repo) { create(:repo) }

  # Helper: millisecond epoch from a Time-like value
  def ms(time)
    (time.to_f * 1000).to_i
  end

  describe "#call — temporal correlation" do
    it "correlates a session to a PR when their time ranges overlap" do
      pr = create(:pr, repo: repo, branch: "feature/login",
        created_at_source: 3.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/login",
        started_at: ms(2.days.ago), ended_at: ms(2.days.ago + 1.hour))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_present
    end

    it "does not correlate when session is entirely before the PR" do
      pr = create(:pr, repo: repo, branch: "feature/login",
        created_at_source: 2.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/login",
        started_at: ms(5.days.ago), ended_at: ms(4.days.ago))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_nil
    end

    it "does not correlate when session is entirely after the PR closed" do
      pr = create(:pr, repo: repo, branch: "feature/login",
        created_at_source: 5.days.ago.iso8601, merged_at: 4.days.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/login",
        started_at: ms(1.day.ago), ended_at: ms(1.day.ago + 1.hour))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_nil
    end

    it "correlates to an open PR when session is after PR creation" do
      pr = create(:pr, repo: repo, branch: "feature/wip",
        created_at_source: 3.days.ago.iso8601, state: "open")
      session = create(:coding_session, repo: repo, branch: "feature/wip",
        started_at: ms(1.day.ago), ended_at: ms(1.day.ago + 1.hour))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_present
    end

    it "does not correlate to an open PR when session ended before PR creation" do
      pr = create(:pr, repo: repo, branch: "feature/wip",
        created_at_source: 1.day.ago.iso8601, state: "open")
      session = create(:coding_session, repo: repo, branch: "feature/wip",
        started_at: ms(5.days.ago), ended_at: ms(3.days.ago))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_nil
    end
  end

  describe "#call — branch reuse" do
    it "correlates to the correct PR when a branch is reused" do
      old_pr = create(:pr, repo: repo, branch: "feature/auth",
        created_at_source: 30.days.ago.iso8601, merged_at: 28.days.ago.iso8601)
      new_pr = create(:pr, repo: repo, branch: "feature/auth",
        created_at_source: 2.days.ago.iso8601, merged_at: 1.day.ago.iso8601)

      old_session = create(:coding_session, repo: repo, branch: "feature/auth",
        started_at: ms(29.days.ago), ended_at: ms(29.days.ago + 2.hours))
      new_session = create(:coding_session, repo: repo, branch: "feature/auth",
        started_at: ms(2.days.ago + 1.hour), ended_at: ms(2.days.ago + 3.hours))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: old_session.id, pr_id: old_pr.id)).to be_present
      expect(SessionPr.find_by(session_id: old_session.id, pr_id: new_pr.id)).to be_nil
      expect(SessionPr.find_by(session_id: new_session.id, pr_id: new_pr.id)).to be_present
      expect(SessionPr.find_by(session_id: new_session.id, pr_id: old_pr.id)).to be_nil
    end

    it "picks the most recently created PR when multiple PRs overlap a session" do
      older_pr = create(:pr, repo: repo, branch: "feature/overlap",
        created_at_source: 5.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      newer_pr = create(:pr, repo: repo, branch: "feature/overlap",
        created_at_source: 3.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/overlap",
        started_at: ms(2.days.ago), ended_at: ms(2.days.ago + 1.hour))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: newer_pr.id)).to be_present
      expect(SessionPr.find_by(session_id: session.id, pr_id: older_pr.id)).to be_nil
    end
  end

  describe "#call — edge cases" do
    it "skips sessions with nil started_at" do
      pr = create(:pr, repo: repo, branch: "feature/x",
        created_at_source: 2.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/x",
        started_at: nil, ended_at: ms(1.day.ago))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_nil
    end

    it "skips PRs with nil created_at_source" do
      pr = create(:pr, repo: repo, branch: "feature/x",
        created_at_source: nil, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/x",
        started_at: ms(2.days.ago), ended_at: ms(1.day.ago))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_nil
    end

    it "matches a session with nil ended_at to an overlapping PR" do
      pr = create(:pr, repo: repo, branch: "feature/x",
        created_at_source: 3.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/x",
        started_at: ms(2.days.ago), ended_at: nil)

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_present
    end

    it "does not match sessions across different branches" do
      pr = create(:pr, repo: repo, branch: "feature/a",
        created_at_source: 3.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: repo, branch: "feature/b",
        started_at: ms(2.days.ago), ended_at: ms(2.days.ago + 1.hour))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_nil
    end

    it "does not match sessions across different repos" do
      other_repo = create(:repo)
      pr = create(:pr, repo: repo, branch: "feature/x",
        created_at_source: 3.days.ago.iso8601, merged_at: 1.day.ago.iso8601)
      session = create(:coding_session, repo: other_repo, branch: "feature/x",
        started_at: ms(2.days.ago), ended_at: ms(2.days.ago + 1.hour))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: session.id, pr_id: pr.id)).to be_nil
    end

    it "uses closed_at when merged_at is nil" do
      pr = create(:pr, repo: repo, branch: "feature/closed",
        created_at_source: 5.days.ago.iso8601, closed_at: 3.days.ago.iso8601, state: "closed")
      overlapping = create(:coding_session, repo: repo, branch: "feature/closed",
        started_at: ms(4.days.ago), ended_at: ms(4.days.ago + 1.hour))
      too_late = create(:coding_session, repo: repo, branch: "feature/closed",
        started_at: ms(1.day.ago), ended_at: ms(1.day.ago + 1.hour))

      described_class.new(repo).call

      expect(SessionPr.find_by(session_id: overlapping.id, pr_id: pr.id)).to be_present
      expect(SessionPr.find_by(session_id: too_late.id, pr_id: pr.id)).to be_nil
    end
  end
end
