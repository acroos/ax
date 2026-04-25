module WebhookHandlers
  module Gitlab
    class MrMerged < WebhookHandlers::Base
      def initialize(mr_data, repo)
        @mr_data = mr_data
        @repo = repo
      end

      def call
        pr = Pr.find_or_initialize_by(repo: @repo, number: @mr_data[:iid])
        pr.update!(
          title: @mr_data[:title],
          branch: @mr_data[:source_branch],
          state: "merged",
          merged_at: @mr_data[:merged_at] || @mr_data[:updated_at],
          url: @mr_data[:url],
          author: @mr_data.dig(:last_commit, :author, :name) || @mr_data[:author_id].to_s
        )
        return if pr_finalized?(pr)

        with_finalization_lock(pr) do
          return if pr_finalized?(pr)

          GitlabDataFetcher.new(pr).call
          computed = MetricsComputer.new(pr).call

          ActiveRecord::Base.transaction do
            metrics = ensure_pr_metrics(pr)
            metrics.with_lock do
              return if metrics.finalized?

              attrs = computed.compact
              attrs[:metrics_finalized] = true
              attrs[:finalized_at] = metrics.finalized_at || Time.current
              metrics.update!(attrs)
            end
          end
        end
      rescue => e
        Rails.logger.error("[gitlab-finalization] Failed for MR !#{@mr_data[:iid]}: #{e.class}: #{e.message}")
      end
    end
  end
end
