Rails.application.routes.draw do
  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # Webhooks (signature-validated, not API key auth)
  post "/webhooks/github", to: "webhooks#github"

  namespace :api do
    namespace :v1 do
      # Health
      get "/health", to: "health#show"

      # CLI push (API key auth)
      post "/push", to: "push#create"

      # Watch status
      get "/watch-status", to: "watch_status#index"

      # Org-scoped read endpoints
      resources :orgs, param: :slug, only: [] do
        resources :repos, only: [:index] do
          member do
            get :prs
            get :metrics
            get :timeline
            get "repo-metrics", to: "repos#repo_metrics"
          end
        end
      end
    end
  end
end
