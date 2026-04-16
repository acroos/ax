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
      item = stripe_sub.items.data.first

      # If the Stripe subscription was already canceled before we got to process
      # this event (e.g., a delayed webhook redelivered after the user cleaned
      # up duplicate subs), skip it entirely. Don't create a stale local row,
      # don't flip the org's plan.
      return if stripe_sub.status == "canceled"

      Subscription.find_or_create_by!(stripe_subscription_id: stripe_subscription_id) do |sub|
        sub.organization = org
        sub.status = stripe_sub.status
        sub.current_period_start = period_time(item, :current_period_start)
        sub.current_period_end = period_time(item, :current_period_end)
        sub.cancel_at_period_end = stripe_sub.cancel_at_period_end
        sub.stripe_subscription_item_id = item&.id
        sub.quantity = item&.quantity || 1
      end

      org.update!(plan: "pro") if stripe_sub.status == "active" || stripe_sub.status == "trialing"

      Rails.logger.info("Checkout completed for org #{org.slug} — plan set to pro")
    rescue => e
      Rails.logger.error("StripeHandlers::CheckoutCompleted failed: #{e.message}")
      raise
    end

    private

    # Stripe API 2025-04-30.basil moved current_period_start/end from the
    # Subscription object onto each subscription item. This reads from the
    # item with safe nil handling.
    def period_time(item, attr)
      return nil unless item
      value = item.respond_to?(attr) ? item.public_send(attr) : nil
      value ? Time.at(value) : nil
    end
  end
end
