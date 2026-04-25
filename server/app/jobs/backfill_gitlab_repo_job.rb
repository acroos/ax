class BackfillGitlabRepoJob < ApplicationJob
  queue_as :default

  retry_on GitlabApp::Client::RateLimitError, wait: :polynomially_longer, attempts: 8
  retry_on GitlabApp::Client::Error, wait: :polynomially_longer, attempts: 3

  def perform(repo_id)
    repo = Repo.find(repo_id)
    connection = repo.gitlab_connection
    return unless connection&.active?
    return unless repo.gitlab_project_id.present?

    client = GitlabApp::Client.new(connection)
    since = ENV.fetch("GITLAB_BACKFILL_DAYS", "90").to_i.days.ago

    page = 1
    loop do
      mrs = client.list_merge_requests(repo.gitlab_project_id, state: "all", updated_after: since, page: page, per_page: 100)
      break if mrs.empty?

      repo_data = { owner: { login: repo.platform_owner }, name: repo.platform_repo }

      mrs.each do |mr|
        backfill_mr(mr, repo_data, repo, client)
      end

      page += 1
    end

    SessionPrCorrelationService.new(repo).call
    repo.update!(last_synced_at: Time.current)
  end

  private

  def backfill_mr(mr, repo_data, repo, client)
    pr_data = translate_mr_to_pr(mr)
    WebhookHandlers::PrOpened.new(pr_data, repo_data).call

    if mr[:merged_at].present?
      WebhookHandlers::Gitlab::MrMerged.new(mr, repo).call
    elsif mr[:closed_at].present?
      WebhookHandlers::Gitlab::MrClosed.new(mr, repo).call
    end
  rescue => e
    Rails.logger.error(
      "[gitlab-backfill] Failed for MR !#{mr[:iid]} " \
      "in #{repo.platform_owner}/#{repo.platform_repo}: #{e.class}: #{e.message}"
    )
  end

  def translate_mr_to_pr(mr)
    {
      number: mr[:iid],
      title: mr[:title],
      head: { ref: mr[:source_branch] },
      state: translate_state(mr[:state]),
      created_at: mr[:created_at],
      merged_at: mr[:merged_at],
      closed_at: mr[:closed_at],
      html_url: mr[:web_url],
      additions: 0,
      deletions: 0,
      changed_files: 0,
      commits: 0,
      user: { login: mr[:author]&.dig(:username) },
      merged: mr[:merged_at].present?
    }
  end

  def translate_state(state)
    case state
    when "merged" then "merged"
    when "closed" then "closed"
    else "open"
    end
  end
end
