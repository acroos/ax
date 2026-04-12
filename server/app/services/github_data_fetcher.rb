class GithubDataFetcher
  def initialize(pr)
    @pr = pr
    @repo = pr.repo
  end

  def call
    return unless github_client

    fetch_pr_files
    fetch_commit_stats
  end

  private

  def github_client
    return @github_client if defined?(@github_client)

    installation = @repo.github_installation
    @github_client = installation ? GithubApp::Client.new(installation) : nil
  end

  def fetch_pr_files
    files = github_client.list_pull_files(
      owner: @repo.github_owner,
      repo: @repo.github_repo,
      number: @pr.number
    )

    files.each do |file|
      PrFile.find_or_initialize_by(pr: @pr, filename: file[:filename]).update!(
        additions: file[:additions] || 0,
        deletions: file[:deletions] || 0,
        line_changes: file[:changes] || 0,
        status: file[:status]
      )
    end
  end

  def fetch_commit_stats
    commits = github_client.list_pull_commits(
      owner: @repo.github_owner,
      repo: @repo.github_repo,
      number: @pr.number
    )

    commits.each do |commit_data|
      sha = commit_data[:sha]
      stats = commit_data[:stats] || {}

      existing = Commit.find_by(sha: sha)
      if existing
        existing.update!(
          additions: stats[:additions] || existing.additions,
          deletions: stats[:deletions] || existing.deletions
        )
      else
        Commit.create!(
          sha: sha,
          repo: @repo,
          pr: @pr,
          author: commit_data.dig(:commit, :author, :name),
          message: commit_data.dig(:commit, :message),
          additions: stats[:additions] || 0,
          deletions: stats[:deletions] || 0
        )
      end
    end
  end
end
