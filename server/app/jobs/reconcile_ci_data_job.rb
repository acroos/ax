class ReconcileCiDataJob < ApplicationJob
  queue_as :default

  # Finds finalized PRs that have nil ci_success_rate but commits with
  # ci_passed data, and recomputes the metric. Also re-fetches CI status
  # for commits that still have ci_passed = nil (late-arriving check suites).
  def perform
    backfill_missing_ci_status
    recompute_stale_rates
  end

  private

  # Re-fetch check suite results for commits that never got ci_passed set.
  # This catches the case where all suites were in-progress at finalization
  # time and no check_suite.completed webhook arrived.
  def backfill_missing_ci_status
    Commit.joins(pr: :pr_metrics)
           .where(ci_passed: nil)
           .where(pr_metrics: { metrics_finalized: true })
           .includes(repo: :github_installation)
           .find_each do |commit|
      installation = commit.repo.github_installation
      next unless installation&.active?

      fetch_ci_for_commit(commit, installation)
    end
  end

  # Recompute ci_success_rate for finalized PRs where the rate is nil
  # but commits now have ci_passed data (filled by webhooks or the
  # backfill above).
  def recompute_stale_rates
    PrMetrics.where(metrics_finalized: true, ci_success_rate: nil)
             .includes(pr: :commits)
             .find_each do |metrics|
      pr = metrics.pr
      commits_with_ci = pr.commits.where.not(ci_passed: nil)
      next unless commits_with_ci.exists?

      rate = commits_with_ci.where(ci_passed: true).count.to_f / commits_with_ci.count
      metrics.update_column(:ci_success_rate, rate)
    end
  end

  def fetch_ci_for_commit(commit, installation)
    client = GithubApp::Client.new(installation)
    response = client.list_check_suites(
      owner: commit.repo.platform_owner,
      repo: commit.repo.platform_repo,
      ref: commit.sha
    )

    check_suites = response[:check_suites] || []
    return if check_suites.empty?

    completed = check_suites.select { |cs| cs[:status] == "completed" }
    return if completed.empty?

    all_passed = completed.all? { |cs| cs[:conclusion] == "success" }
    commit.update!(ci_passed: all_passed)
  rescue => e
    Rails.logger.warn("[reconcile_ci] Failed for commit #{commit.sha}: #{e.message}")
  end
end
