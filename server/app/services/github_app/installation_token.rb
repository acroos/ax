module GithubApp
  class InstallationToken
    CACHE_KEY = "github_installation_token:%{id}"

    def self.fetch(installation_id)
      Rails.cache.fetch(CACHE_KEY % { id: installation_id }, expires_in: 50.minutes) do
        mint(installation_id)
      end
    end

    def self.mint(installation_id)
      app_jwt = GithubApp::JwtGenerator.generate
      client = Octokit::Client.new(bearer_token: app_jwt)
      result = client.create_app_installation_access_token(installation_id)
      result[:token]
    end
  end
end
