module GithubApp
  class StateToken
    PURPOSE = :github_app_install

    # Generate a signed, time-limited token encoding the org slug and user ID.
    # Used as the `state` parameter in the GitHub App install flow.
    def self.generate(org_slug:, user_id:)
      verifier.generate(
        { org: org_slug, user: user_id },
        purpose: PURPOSE,
        expires_in: 10.minutes
      )
    end

    # Verify and decode a state token. Returns { "org" => "slug", "user" => 123 }.
    # Raises ActiveSupport::MessageVerifier::InvalidSignature on tamper or expiry.
    def self.verify(token)
      verifier.verify(token, purpose: PURPOSE).with_indifferent_access
    end

    def self.verifier
      Rails.application.message_verifier("github_app_install")
    end
    private_class_method :verifier
  end
end
