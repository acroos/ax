module WebhookHandlers
  module Gitlab
    class MrOpened < WebhookHandlers::Base
      def initialize(mr_data, repo)
        @mr_data = mr_data
        @repo = repo
      end

      def call
        pr = find_or_create_mr_as_pr
        pr.update!(
          state: "open",
          open_commit_count: 0
        )

        metrics = ensure_pr_metrics(pr)
        metrics.update!(post_open_commits: 0) unless metrics.finalized?

        SessionPrCorrelationService.new(@repo).call
      end

      private

      def find_or_create_mr_as_pr
        pr = Pr.find_or_initialize_by(repo: @repo, number: @mr_data[:iid])
        pr.update!(
          title: @mr_data[:title],
          branch: @mr_data[:source_branch],
          state: translate_state(@mr_data[:state]),
          created_at_source: @mr_data[:created_at],
          merged_at: @mr_data[:merged_at],
          closed_at: @mr_data[:closed_at],
          url: @mr_data[:url],
          additions: 0,
          deletions: 0,
          changed_files: 0,
          author: @mr_data.dig(:last_commit, :author, :name) || @mr_data[:author_id].to_s
        )
        pr
      end

      def translate_state(state)
        case state
        when "merged" then "merged"
        when "closed" then "closed"
        else "open"
        end
      end
    end
  end
end
