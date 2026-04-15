module Api
  module V1
    class BillingController < BaseController
      before_action :require_session_auth!
      before_action :find_org!
      before_action :find_org_as_admin!, only: [ :checkout, :portal ]

      def show
        plan = PlanService.for(@org)
        subscription = @org.subscription

        render json: {
          plan: plan.plan_details,
          subscription: subscription ? {
            status: subscription.status,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end
          } : nil,
          usage: {
            members: @org.org_memberships.count,
            repos: @org.repos.count
          }
        }
      end

      def checkout
        if @org.subscription&.status&.in?(%w[active trialing])
          return render json: { error: "Organization already has an active subscription" }, status: :unprocessable_entity
        end

        session = StripeService.create_checkout_session(
          @org,
          success_url: "#{dashboard_url}/#{@org.slug}/billing?billing=success",
          cancel_url: "#{dashboard_url}/#{@org.slug}/billing?billing=canceled"
        )

        render json: { url: session.url }
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def portal
        session = StripeService.create_portal_session(
          @org,
          return_url: "#{dashboard_url}/#{@org.slug}/billing"
        )

        render json: { url: session.url }
      rescue StripeService::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      private

      def dashboard_url
        ENV.fetch("DASHBOARD_URL", "http://localhost:3333")
      end
    end
  end
end
