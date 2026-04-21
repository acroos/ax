module Api
  module V1
    class TeamsController < BaseController
      include PrSerialization

      before_action :require_session_auth!
      before_action :find_org!, only: [ :index, :show, :prs, :metrics ]
      before_action :find_org_as_admin!, only: [ :create, :update, :destroy ]
      before_action :require_teams_feature!
      before_action :find_team!, only: [ :show, :prs, :metrics ]
      before_action :find_team_as_admin!, only: [ :update, :destroy ]

      def index
        teams = if current_user.admin_or_owner_of?(@org)
          @org.teams
        else
          current_user.teams_in(@org)
        end

        render json: build_team_tree(teams)
      end

      def create
        parent = nil
        if params[:parent_team_slug].present?
          parent = @org.teams.find_by!(slug: params[:parent_team_slug])
        end

        team = @org.teams.create!(
          name: params[:name],
          slug: generate_slug(params[:name]),
          parent_team: parent,
          created_by: current_user
        )

        render json: serialize_team(team), status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Parent team not found" }, status: :not_found
      end

      def show
        render json: serialize_team_detail(@team)
      end

      def update
        attrs = {}
        attrs[:name] = params[:name] if params[:name].present?
        if params.key?(:parent_team_slug)
          attrs[:parent_team] = if params[:parent_team_slug].present?
            @org.teams.find_by!(slug: params[:parent_team_slug])
          end
        end

        @team.update!(attrs)
        render json: serialize_team(@team)
      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Parent team not found" }, status: :not_found
      end

      def destroy
        descendant_count = @team.descendant_team_ids.size
        @team.destroy!
        render json: { deleted_count: descendant_count + 1 }
      end

      def prs
        usernames = @team.member_github_usernames
        scope = Pr
          .joins(:repo)
          .where(repos: { organization_id: @org.id }, author: usernames)
          .left_joins(:pr_metrics)
          .includes(:pr_metrics, :repo, :session_prs)
          .order(created_at: :desc, id: :desc)

        render_paginated_prs(scope)
      end

      def metrics
        usernames = @team.member_github_usernames
        scope = PrMetrics
          .joins(pr: :repo)
          .where(repos: { organization_id: @org.id })
          .where(prs: { author: usernames })
          .where(metrics_finalized: true)

        render json: MetricsAggregator.new(scope, window_days: parsed_range).call
      end

      private

      def generate_slug(name)
        name.to_s.downcase.strip.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
      end

      def serialize_team(team)
        {
          id: team.id,
          slug: team.slug,
          name: team.name,
          parent_team_slug: team.parent_team&.slug,
          member_count: team.direct_member_count,
          child_team_count: team.child_teams.count
        }
      end

      def serialize_team_detail(team)
        serialize_team(team).merge(
          members: team.team_memberships.includes(org_membership: :user).map { |tm|
            {
              id: tm.id,
              org_membership_id: tm.org_membership_id,
              user: {
                id: tm.user.id,
                github_username: tm.user.github_username,
                display_name: tm.user.display_name,
                avatar_url: tm.user.avatar_url
              }
            }
          },
          child_teams: team.child_teams.map { |ct| serialize_team(ct) }
        )
      end

      def build_team_tree(teams)
        all_teams = teams.includes(:parent_team, :child_teams, :team_memberships)
        all_teams.map { |t| serialize_team(t) }
      end
    end
  end
end
