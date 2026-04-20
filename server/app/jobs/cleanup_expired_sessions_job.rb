class CleanupExpiredSessionsJob < ApplicationJob
  queue_as :default

  # Retention: keep expired records for 7 days after expiry for debugging,
  # then purge. Sessions contain IP addresses and user agents (PII).
  RETENTION_PERIOD = 7.days

  def perform
    cleanup_sessions
    cleanup_invites
  end

  private

  def cleanup_sessions
    UserSession.where("expires_at < ?", RETENTION_PERIOD.ago).delete_all
  end

  def cleanup_invites
    Invite.where(status: "pending").where("expires_at < ?", RETENTION_PERIOD.ago).update_all(status: "expired")
  end
end
