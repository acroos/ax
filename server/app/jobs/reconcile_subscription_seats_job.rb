class ReconcileSubscriptionSeatsJob < ApplicationJob
  queue_as :default

  def perform
    Subscription.where(status: %w[active trialing]).find_each do |subscription|
      reconcile(subscription)
    rescue => e
      Rails.logger.error("ReconcileSubscriptionSeatsJob: failed for subscription #{subscription.stripe_subscription_id}: #{e.message}")
    end
  end

  private

  def reconcile(subscription)
    org = subscription.organization
    expected = [ org.org_memberships.count, 1 ].max
    return if subscription.quantity == expected

    proration = expected > subscription.quantity ? "create_prorations" : "none"
    StripeService.update_seat_count(subscription, expected, proration_behavior: proration)

    Rails.logger.info(
      "ReconcileSubscriptionSeatsJob: adjusted org #{org.slug} seats from #{subscription.quantity} to #{expected}"
    )
  end
end
