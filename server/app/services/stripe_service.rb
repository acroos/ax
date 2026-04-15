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

    Stripe::Checkout::Session.create(
      customer: customer.id,
      mode: "subscription",
      line_items: [ { price: ENV.fetch("STRIPE_PRO_PRICE_ID"), quantity: 1 } ],
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
end
