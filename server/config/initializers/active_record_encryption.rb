# ActiveRecord Encryption for GitLab OAuth tokens.
# Production reads keys from Rails credentials; dev/test use deterministic keys.
if Rails.env.test? || Rails.env.development?
  Rails.application.config.active_record.encryption.primary_key = "test-primary-key-that-is-32-bytes"
  Rails.application.config.active_record.encryption.deterministic_key = "test-deterministic-key-32-bytes!"
  Rails.application.config.active_record.encryption.key_derivation_salt = "test-key-derivation-salt"
end
