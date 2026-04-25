class GitlabDataFetcher
  def initialize(pr)
    @pr = pr
    @repo = pr.repo
  end

  def call
    return unless gitlab_client

    fetch_mr_files
    update_pr_stats
    fetch_commit_stats
  end

  private

  def gitlab_client
    return @gitlab_client if defined?(@gitlab_client)

    connection = @repo.gitlab_connection
    @gitlab_client = connection&.active? ? GitlabApp::Client.new(connection) : nil
  end

  def project_id
    @repo.gitlab_project_id
  end

  def fetch_mr_files
    return unless project_id

    changes = gitlab_client.get_merge_request_changes(project_id, @pr.number)
    files = changes&.dig(:changes) || []

    files.each do |file|
      # GitLab uses old_path/new_path instead of filename
      filename = file[:new_path] || file[:old_path]
      next unless filename

      # GitLab doesn't provide per-file additions/deletions in the changes endpoint.
      # Count from the diff if available.
      additions, deletions = count_diff_lines(file[:diff])

      PrFile.find_or_initialize_by(pr: @pr, filename: filename).update!(
        additions: additions,
        deletions: deletions,
        line_changes: additions + deletions,
        status: translate_file_status(file)
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
    return unless project_id

    commits = gitlab_client.list_merge_request_commits(project_id, @pr.number)
    return unless commits

    commits.each do |commit_data|
      sha = commit_data[:id] || commit_data[:short_id]
      next unless sha

      # Fetch individual commit for stats
      full_commit = gitlab_client.get_commit(project_id, sha)
      stats = full_commit&.dig(:stats) || {}

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
          author: commit_data[:author_name],
          message: commit_data[:message],
          committed_at: commit_data[:committed_date],
          additions: stats[:additions] || 0,
          deletions: stats[:deletions] || 0
        )
      end

      fetch_ci_status(sha)
    end
  end

  def fetch_ci_status(sha)
    pipelines = gitlab_client.list_pipelines(project_id, sha: sha)
    return if pipelines.nil? || pipelines.empty?

    commit = Commit.find_by(sha: sha)
    return unless commit

    # Only consider finished pipelines
    finished = pipelines.select { |p| %w[success failed].include?(p[:status]) }
    return if finished.empty?

    # Failure is sticky: any failed pipeline means ci_passed = false
    all_passed = finished.all? { |p| p[:status] == "success" }
    commit.update!(ci_passed: all_passed)
  rescue => e
    Rails.logger.warn("[gitlab-ci-status] Failed to fetch pipelines for #{sha}: #{e.message}")
  end

  def count_diff_lines(diff)
    return [ 0, 0 ] if diff.blank?

    additions = 0
    deletions = 0
    diff.each_line do |line|
      case line[0]
      when "+"
        additions += 1 unless line.start_with?("+++")
      when "-"
        deletions += 1 unless line.start_with?("---")
      end
    end
    [ additions, deletions ]
  end

  def translate_file_status(file)
    if file[:new_file]
      "added"
    elsif file[:deleted_file]
      "removed"
    elsif file[:renamed_file]
      "renamed"
    else
      "modified"
    end
  end
end
