Rails.application.routes.draw do
  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # Auth (Devise + OmniAuth)
  devise_for :users, controllers: { omniauth_callbacks: "auth/omniauth_callbacks" }
  get  "/auth/me", to: "auth/sessions#me"
  post "/auth/logout", to: "auth/sessions#destroy"

  # Public
  post "/waitlist", to: "waitlist#create"

  # Webhooks (signature-validated, not session/key auth)
  post "/webhooks/github", to: "webhooks#github"

  namespace :api do
    namespace :v1 do
      # Health
      get "/health", to: "health#show"

      # CLI push (API key auth)
      post "/push", to: "push#create"

      # Watch status
      get "/watch-status", to: "watch_status#index"

      # Session-authenticated (dashboard)
      resources :orgs, param: :slug, only: [:index, :create] do
        member do
          get "/", to: "organizations#show"
          put "/", to: "organizations#update"
        end
        resources :members, only: [:index, :update, :destroy]
        resources :invites, controller: "org_invites", only: [:index, :create, :destroy]
        resources :repos, only: [:index] do
          member do
            get :prs
            get :metrics
            get :timeline
            get "repo-metrics", to: "repos#repo_metrics"
          end
        end
      end

      # Invite acceptance (session-authed, not org-scoped — the accepting
      # user's session identifies them, and the invite token identifies the org)
      post "/invites/:token/accept", to: "invites#create"

      # User settings
      resource :api_key, only: [:show] do
        post :rotate
      end
    end
  end
end
