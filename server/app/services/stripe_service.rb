class StripeService
  class Error < StandardError; end

  def self.find_or_create_customer(org)
    org.with_lock do
      org.reload
      return Stripe::Customer.retrieve(org.stripe_customer_id) if org.stripe_customer_id.present?

      customer = Stripe::Customer.create(
        name: org.name,
        metadata: { org_id: org.id, org_slug: org.slug }
      )

      org.update!(stripe_customer_id: customer.id)
      customer
    end
  end

  def self.create_checkout_session(org, success_url:, cancel_url:)
    customer = find_or_create_customer(org)
    seat_count = [ org.org_memberships.count, 1 ].max

    Stripe::Checkout::Session.create(
      customer: customer.id,
      mode: "subscription",
      line_items: [ { price: ENV.fetch("STRIPE_PRO_PRICE_ID"), quantity: seat_count } ],
      success_url: success_url,
      cancel_url: cancel_url,
      metadata: { org_id: org.id },
      subscription_data: { metadata: { org_id: org.id } }
    )
  end

  def self.create_portal_session(org, return_url:)
    raise Error, "No Stripe customer for this organization" unless org.stripe_customer_id.present?

    Stripe::BillingPortal::Session.create(
      customer: org.stripe_customer_id,
      return_url: return_url
    )
  end

  # Updates the seat quantity on an existing Stripe subscription and syncs
  # the local Subscription record. Use proration_behavior: "create_prorations"
  # for increases (charge immediately) and "none" for decreases (apply at next
  # billing cycle, no refund).
  def self.update_seat_count(subscription, new_quantity, proration_behavior: "create_prorations")
    raise Error, "No subscription item ID on subscription" if subscription.stripe_subscription_item_id.blank?
    raise Error, "Quantity must be at least 1" if new_quantity < 1

    Stripe::SubscriptionItem.update(
      subscription.stripe_subscription_item_id,
      quantity: new_quantity,
      proration_behavior: proration_behavior
    )

    subscription.update!(quantity: new_quantity)
  end
end
