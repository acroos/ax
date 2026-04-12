module GithubApp
  class Client
    def initialize(installation)
      @installation = installation
    end

    def list_pulls(owner:, repo:, state: "all", since: nil)
      pulls = client.pull_requests("#{owner}/#{repo}", state: state)
      if since
        pulls.select { |pr| pr[:updated_at] >= since }
      else
        pulls
      end
    end

    def list_pull_reviews(owner:, repo:, number:)
      client.pull_request_reviews("#{owner}/#{repo}", number)
    end

    def list_check_suites(owner:, repo:, ref:)
      client.check_suites_for_ref("#{owner}/#{repo}", ref)
    end

    def list_repositories
      client.list_app_installation_repositories[:repositories]
    end

    def list_pull_files(owner:, repo:, number:)
      client.pull_request_files("#{owner}/#{repo}", number)
    end

    def list_pull_commits(owner:, repo:, number:)
      client.pull_request_commits("#{owner}/#{repo}", number)
    end

    private

    def client
      @client ||= Octokit::Client.new(
        access_token: GithubApp::InstallationToken.fetch(@installation.github_installation_id),
        auto_paginate: true
      )
    end
  end
end
