module GithubApp
  class JwtGenerator
    EXPIRY = 9.minutes

    def self.generate
      payload = {
        iat: Time.now.to_i - 30,
        exp: Time.now.to_i + EXPIRY.to_i,
        iss: app_id
      }
      JWT.encode(payload, private_key, "RS256")
    end

    def self.app_id
      ENV.fetch("GITHUB_APP_ID").to_i
    end

    def self.private_key
      OpenSSL::PKey::RSA.new(ENV.fetch("GITHUB_APP_PRIVATE_KEY"))
    end
  end
end
