module Api
  module V1
    class PushController < BaseController
      before_action :require_api_key_auth!

      # 10MB payload limit
      MAX_PAYLOAD_SIZE = 10.megabytes

      def create
        if !request.content_length || request.content_length > MAX_PAYLOAD_SIZE
          return render json: { ok: false, error: "Payload too large" }, status: :content_too_large
        end

        result = PushService.new(push_params, user: current_user).execute
        render json: { ok: true, entities: result }
      rescue PushService::Error => e
        render json: { ok: false, error: e.message }, status: :unprocessable_entity
      end

      private

      def push_params
        params.permit(
          :repo_path, :remote_url, :owner, :repo,
          prs: [
            :number, :title, :branch, :state, :created_at,
            :merged_at, :closed_at, :url, :additions, :deletions, :changed_files
          ],
          sessions: [
            :id, :branch, :started_at, :ended_at, :message_count, :turn_count,
            :input_tokens, :output_tokens, :cache_creation_input_tokens,
            :cache_read_input_tokens, :total_cost_usd, :primary_model,
            :files_read_count, :files_modified_count,
            :assistant_message_count, :sidechain_messages, :total_file_reads,
            :peak_context_pct, :total_tool_calls, :agent_tool_calls,
            :skill_tool_calls, :mcp_tool_calls
          ],
          commits: [
            :sha, :pr_number, :session_id, :message, :author, :committed_at,
            :is_claude_authored, :is_post_open, :additions, :deletions, :files_changed
          ],
          session_prs: [ :session_id, :pr_number, :confidence ],
          pr_metrics: [
            :pr_number, :post_open_commits,
            :ci_success_rate, :line_revisit_rate
          ]
        )
      end
    end
  end
end
