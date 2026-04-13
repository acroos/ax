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

  # GitHub App install callback (browser redirect from GitHub, state token is auth)
  get "/github/installations/callback", to: "github_app/installations#callback"

  namespace :api do
    namespace :v1 do
      # Health
      get "/health", to: "health#show"

      # CLI (API key auth)
      post "/push", to: "push#create"
      get "/ping", to: "ping#show"

      # Watch status
      get "/watch-status", to: "watch_status#index"

      # Session-authenticated (dashboard)
      resources :orgs, param: :slug, only: [ :index, :create ] do
        member do
          get "/", to: "organizations#show"
          put "/", to: "organizations#update"
        end
        resources :members, only: [ :index, :update, :destroy ]
        resources :invites, controller: "org_invites", only: [ :index, :create, :destroy ]
        resource :github_installation, only: [ :show ], controller: "github_installations" do
          post :install_url
        end
        # Org-level PRs (all repos)
        get :prs, to: "organizations#prs"
        get :metrics, to: "organizations#metrics"

        resources :repos, only: [ :index ] do
          member do
            get :prs
            get :metrics
            get :timeline
            get "repo-metrics", to: "repos#repo_metrics"
          end
        end
      end

      # Single PR detail (session-authed, access checked against user's orgs)
      resources :prs, only: [ :show ], controller: "prs"

      # Invite acceptance (session-authed, not org-scoped — the accepting
      # user's session identifies them, and the invite token identifies the org)
      post "/invites/:token/accept", to: "invites#create"

      # User settings
      resource :api_key, only: [ :show ] do
        post :rotate
        get :reveal
      end
    end
  end
end
