module Api
  module V1
    class AgentsController < BaseController
      before_action :require_session_auth!

      def index
        render json: { agents: AgentRegistry::AGENTS }
      end
    end
  end
end
