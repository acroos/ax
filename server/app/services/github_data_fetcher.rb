class GithubDataFetcher
  def initialize(pr)
    @pr = pr
    @repo = pr.repo
  end

  def call
    return unless github_client

    fetch_pr_files
    update_pr_stats
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

  def update_pr_stats
    total_additions = @pr.pr_files.sum(:additions)
    total_deletions = @pr.pr_files.sum(:deletions)
    total_files = @pr.pr_files.count

    @pr.update!(
      additions: total_additions,
      deletions: total_deletions,
      changed_files: total_files
    )
  end

  def fetch_commit_stats
    commits = github_client.list_pull_commits(
      owner: @repo.github_owner,
      repo: @repo.github_repo,
      number: @pr.number
    )

    commits.each do |commit_data|
      sha = commit_data[:sha]

      # The list-commits endpoint does NOT return per-commit stats.
      # Fetch each commit individually to get additions/deletions.
      full_commit = github_client.get_commit(
        owner: @repo.github_owner,
        repo: @repo.github_repo,
        sha: sha
      )
      stats = full_commit[:stats] || {}

      existing = Commit.find_by(sha: sha)
      if existing
        existing.update!(
          additions: stats[:additions] || existing.additions,
          deletions: stats[:deletions] || existing.deletions
        )
      else
        existing = Commit.create!(
          sha: sha,
          repo: @repo,
          pr: @pr,
          author: commit_data.dig(:commit, :author, :name),
          message: commit_data.dig(:commit, :message),
          additions: stats[:additions] || 0,
          deletions: stats[:deletions] || 0
        )
      end

      fetch_ci_status(existing, sha)
    end
  end

  def fetch_ci_status(commit, sha)
    response = github_client.list_check_suites(
      owner: @repo.github_owner,
      repo: @repo.github_repo,
      ref: sha
    )

    check_suites = response[:check_suites] || []
    completed = check_suites.select { |cs| cs[:status] == "completed" }
    return if completed.empty?

    all_passed = completed.all? { |cs| cs[:conclusion] == "success" }
    commit.update!(ci_passed: all_passed)
  rescue => e
    Rails.logger.warn("[ci_status] Failed to fetch check suites for #{sha}: #{e.message}")
  end
end
