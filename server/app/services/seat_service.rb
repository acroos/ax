# Orchestrates seat (Stripe subscription quantity) changes in sync with
# membership changes. No-ops for orgs without an active subscription
# (free plan), so callers can invoke unconditionally.
class SeatService
  # Increase the seat count by 1. Call BEFORE creating the membership so that
  # a Stripe failure blocks the add (keeping billing and access in sync).
  def self.add_seat!(org)
    subscription = org.subscription
    return unless subscription&.active_or_trialing?

    StripeService.update_seat_count(
      subscription,
      subscription.quantity + 1,
      proration_behavior: "create_prorations"
    )
  end

  # Decrease the seat count by 1 (minimum 1). Call AFTER destroying the
  # membership so a Stripe failure doesn't block the removal — the org may
  # temporarily overpay, but ReconcileSubscriptionSeatsJob will catch drift.
  # Retries once on transient Stripe errors before logging and giving up.
  def self.remove_seat!(org)
    subscription = org.subscription
    return unless subscription&.active_or_trialing?

    new_quantity = [ subscription.quantity - 1, 1 ].max
    return if new_quantity == subscription.quantity

    retries = 0
    begin
      StripeService.update_seat_count(
        subscription,
        new_quantity,
        proration_behavior: "none"
      )
    rescue Stripe::APIConnectionError, Stripe::APIError => e
      retries += 1
      retry if retries <= 1
      Rails.logger.error("SeatService.remove_seat! failed after retry for org #{org.id}: #{e.message}")
    end
  end
end
