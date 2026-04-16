module Api
  module V1
    class BillingController < BaseController
      SEAT_PRICE_CENTS = 2000
      ACTIVE_SUBSCRIPTION_STATUSES = %w[active trialing past_due].freeze

      before_action :require_session_auth!
      before_action :find_org!
      before_action :find_org_as_admin!, only: [ :checkout, :portal, :reconcile ]

      def show
        plan = PlanService.for(@org)
        subscription = @org.subscription

        render json: {
          plan: plan.plan_details,
          subscription: subscription ? {
            status: subscription.status,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end,
            quantity: subscription.quantity,
            seat_price_cents: SEAT_PRICE_CENTS
          } : nil,
          usage: {
            members: @org.org_memberships.count,
            repos: @org.repos.count
          }
        }
      end

      def checkout
        if has_active_subscription?
          return render json: { error: "Organization already has an active subscription" }, status: :unprocessable_entity
        end

        session = StripeService.create_checkout_session(
          @org,
          success_url: "#{dashboard_url}/#{@org.slug}/billing/success?session_id={CHECKOUT_SESSION_ID}",
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

      # Synchronously reconcile a Stripe Checkout Session into local state,
      # so the dashboard reflects the upgrade on the first post-checkout
      # render rather than waiting for the (async) checkout.session.completed
      # webhook to be delivered and processed.
      def reconcile
        session_id = params[:session_id]
        if session_id.blank?
          return render json: { error: "Missing session_id" }, status: :bad_request
        end

        session = Stripe::Checkout::Session.retrieve(session_id)
        metadata_org_id = session.metadata && (session.metadata[:org_id] || session.metadata["org_id"])

        if metadata_org_id.to_s != @org.id.to_s
          return render json: { error: "Session does not belong to this organization" }, status: :forbidden
        end

        if session.subscription.present?
          # Reuse the same handler the webhook uses. find_or_create_by! on the
          # unique stripe_subscription_id makes this a safe no-op if the
          # webhook has already processed the same checkout.
          session_data = JSON.parse(session.to_json, symbolize_names: true)
          StripeHandlers::CheckoutCompleted.new(session_data).call
        end

        render json: { ok: true, plan: @org.reload.plan }
      rescue Stripe::StripeError => e
        Rails.logger.error("BillingController#reconcile Stripe error: #{e.message}")
        render json: { error: e.message }, status: :unprocessable_entity
      end

      private

      # The local Subscription row is the fast path. If it's missing (e.g., the
      # checkout.session.completed webhook hasn't been processed yet) we fall
      # back to asking Stripe directly so we never let a customer create a
      # second subscription against the same Stripe customer.
      def has_active_subscription?
        return true if @org.subscription&.active_or_trialing?
        return false if @org.stripe_customer_id.blank?

        subs = Stripe::Subscription.list(customer: @org.stripe_customer_id, status: "all", limit: 100)
        subs.data.any? { |s| ACTIVE_SUBSCRIPTION_STATUSES.include?(s.status) }
      rescue Stripe::StripeError => e
        # Fail closed: if we can't confirm the customer's state with Stripe,
        # don't let a duplicate checkout slip through. The user can retry once
        # Stripe is reachable again.
        Rails.logger.error("BillingController#has_active_subscription? Stripe error: #{e.message}")
        true
      end

      def dashboard_url
        ENV.fetch("DASHBOARD_URL", "http://localhost:3333")
      end
    end
  end
end
