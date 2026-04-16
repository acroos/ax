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
  # temporarily overpay, but the SubscriptionUpdated webhook will reconcile.
  def self.remove_seat!(org)
    subscription = org.subscription
    return unless subscription&.active_or_trialing?

    new_quantity = [ subscription.quantity - 1, 1 ].max
    return if new_quantity == subscription.quantity

    StripeService.update_seat_count(
      subscription,
      new_quantity,
      proration_behavior: "none"
    )
  end
end
