Devise.setup do |config|
  config.mailer_sender = "noreply@ax.dev"
  require "devise/orm/active_record"

  config.case_insensitive_keys = [ :email ]
  config.strip_whitespace_keys = [ :email ]
  config.skip_session_storage = [ :http_auth ]
  config.stretches = Rails.env.test? ? 1 : 12
  config.sign_out_via = :delete
  config.responder.error_status = :unprocessable_entity
  config.responder.redirect_status = :see_other

  # OmniAuth GitHub
  config.omniauth :github,
    ENV["GITHUB_CLIENT_ID"],
    ENV["GITHUB_CLIENT_SECRET"],
    scope: "read:user,user:email"

  # OmniAuth GitLab
  config.omniauth :gitlab,
    ENV["GITLAB_CLIENT_ID"],
    ENV["GITLAB_CLIENT_SECRET"],
    scope: "read_user api"
end
