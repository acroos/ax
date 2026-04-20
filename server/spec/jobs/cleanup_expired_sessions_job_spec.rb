require "rails_helper"

RSpec.describe CleanupExpiredSessionsJob do
  describe "#perform" do
    describe "session cleanup" do
      it "deletes sessions expired more than 7 days ago" do
        user = create(:user)
        old_session = UserSession.create!(
          user: user,
          expires_at: 8.days.ago,
          user_agent: "Mozilla/5.0",
          ip_address: "192.168.1.1"
        )

        described_class.new.perform

        expect(UserSession.exists?(old_session.id)).to be false
      end

      it "keeps sessions expired less than 7 days ago" do
        user = create(:user)
        recent_session = UserSession.create!(
          user: user,
          expires_at: 6.days.ago,
          user_agent: "Mozilla/5.0",
          ip_address: "192.168.1.1"
        )

        described_class.new.perform

        expect(UserSession.exists?(recent_session.id)).to be true
      end

      it "keeps active sessions" do
        user = create(:user)
        active_session = UserSession.create!(
          user: user,
          expires_at: 30.days.from_now,
          user_agent: "Mozilla/5.0",
          ip_address: "10.0.0.1"
        )

        described_class.new.perform

        expect(UserSession.exists?(active_session.id)).to be true
      end
    end

    describe "invite cleanup" do
      it "marks pending invites as expired when past retention period" do
        invite = create(:invite, status: "pending", expires_at: 8.days.ago)

        described_class.new.perform

        expect(invite.reload.status).to eq("expired")
      end

      it "keeps pending invites within retention period" do
        invite = create(:invite, status: "pending", expires_at: 6.days.ago)

        described_class.new.perform

        expect(invite.reload.status).to eq("pending")
      end

      it "does not touch accepted invites" do
        invite = create(:invite, status: "accepted", expires_at: 8.days.ago)

        described_class.new.perform

        expect(invite.reload.status).to eq("accepted")
      end
    end
  end
end
