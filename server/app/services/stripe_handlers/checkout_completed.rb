module StripeHandlers
  class CheckoutCompleted
    def initialize(session)
      @session = session
    end

    def call
      org_id = @session.dig(:metadata, :org_id)&.to_i
      return unless org_id

      org = Organization.find_by(id: org_id)
      return unless org

      stripe_subscription_id = @session[:subscription]
      return unless stripe_subscription_id

      stripe_sub = Stripe::Subscription.retrieve(stripe_subscription_id)

      Subscription.find_or_create_by!(stripe_subscription_id: stripe_subscription_id) do |sub|
        sub.organization = org
        sub.status = stripe_sub.status
        sub.current_period_start = Time.at(stripe_sub.current_period_start)
        sub.current_period_end = Time.at(stripe_sub.current_period_end)
        sub.cancel_at_period_end = stripe_sub.cancel_at_period_end
      end

      org.update!(plan: "pro") if stripe_sub.status == "active" || stripe_sub.status == "trialing"

      Rails.logger.info("Checkout completed for org #{org.slug} — plan set to pro")
    rescue => e
      Rails.logger.error("StripeHandlers::CheckoutCompleted failed: #{e.message}")
      raise
    end
  end
end
