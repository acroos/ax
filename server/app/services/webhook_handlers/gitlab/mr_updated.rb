module WebhookHandlers
  module Gitlab
    class MrUpdated < WebhookHandlers::Base
      def initialize(mr_data, repo)
        @mr_data = mr_data
        @repo = repo
      end

      def call
        pr = Pr.find_by(repo: @repo, number: @mr_data[:iid])
        return unless pr
        return if pr_finalized?(pr)

        # Update title and branch in case they changed
        pr.update!(
          title: @mr_data[:title],
          branch: @mr_data[:source_branch]
        )

        # Recalculate post_open_commits if the MR payload includes commit info
        # GitLab doesn't give commit count directly in update webhooks,
        # so we fetch from the API if available
        recalculate_post_open_commits(pr)
      end

      private

      def recalculate_post_open_commits(pr)
        connection = @repo.gitlab_connection
        return unless connection&.active? && @repo.gitlab_project_id.present?

        client = GitlabApp::Client.new(connection)
        commits = client.list_merge_request_commits(@repo.gitlab_project_id, pr.number)
        current_commits = commits&.size || 0
        open_count = pr.open_commit_count || 0
        post_open = [ current_commits - open_count, 0 ].max

        metrics = ensure_pr_metrics(pr)
        metrics.update!(post_open_commits: post_open)
      rescue GitlabApp::Client::Error => e
        Rails.logger.warn("[gitlab-mr-updated] Failed to fetch commits for MR !#{pr.number}: #{e.message}")
      end
    end
  end
end
