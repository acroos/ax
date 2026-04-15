require "rails_helper"

RSpec.describe StripeService do
  let(:org) { create(:organization, plan: "free", plan_overrides: {}) }

  describe ".find_or_create_customer" do
    it "creates a Stripe customer and saves the ID" do
      customer = double("Stripe::Customer", id: "cus_test_123")
      allow(Stripe::Customer).to receive(:create).and_return(customer)

      result = StripeService.find_or_create_customer(org)

      expect(result.id).to eq("cus_test_123")
      expect(org.reload.stripe_customer_id).to eq("cus_test_123")
      expect(Stripe::Customer).to have_received(:create).with(
        name: org.name,
        metadata: { org_id: org.id, org_slug: org.slug }
      )
    end

    it "retrieves existing customer when stripe_customer_id is present" do
      org.update!(stripe_customer_id: "cus_existing_456")
      customer = double("Stripe::Customer", id: "cus_existing_456")
      allow(Stripe::Customer).to receive(:retrieve).with("cus_existing_456").and_return(customer)
      allow(Stripe::Customer).to receive(:create)

      result = StripeService.find_or_create_customer(org)

      expect(result.id).to eq("cus_existing_456")
      expect(Stripe::Customer).not_to have_received(:create)
    end
  end

  describe ".create_checkout_session" do
    it "creates a checkout session with the correct parameters" do
      customer = double("Stripe::Customer", id: "cus_test_123")
      allow(Stripe::Customer).to receive(:create).and_return(customer)

      session = double("Stripe::Checkout::Session", url: "https://checkout.stripe.com/test")
      allow(Stripe::Checkout::Session).to receive(:create).and_return(session)
      allow(ENV).to receive(:fetch).with("STRIPE_PRO_PRICE_ID").and_return("price_pro_123")

      result = StripeService.create_checkout_session(
        org,
        success_url: "https://app.test/billing?success=true",
        cancel_url: "https://app.test/billing"
      )

      expect(result.url).to eq("https://checkout.stripe.com/test")
      expect(Stripe::Checkout::Session).to have_received(:create).with(
        customer: "cus_test_123",
        mode: "subscription",
        line_items: [ { price: "price_pro_123", quantity: 1 } ],
        success_url: "https://app.test/billing?success=true",
        cancel_url: "https://app.test/billing",
        metadata: { org_id: org.id },
        subscription_data: { metadata: { org_id: org.id } }
      )
    end
  end

  describe ".create_portal_session" do
    it "creates a portal session for orgs with a Stripe customer" do
      org.update!(stripe_customer_id: "cus_test_123")

      portal_session = double("Stripe::BillingPortal::Session", url: "https://billing.stripe.com/test")
      allow(Stripe::BillingPortal::Session).to receive(:create).and_return(portal_session)

      result = StripeService.create_portal_session(org, return_url: "https://app.test/settings")

      expect(result.url).to eq("https://billing.stripe.com/test")
      expect(Stripe::BillingPortal::Session).to have_received(:create).with(
        customer: "cus_test_123",
        return_url: "https://app.test/settings"
      )
    end

    it "raises an error when org has no Stripe customer" do
      expect {
        StripeService.create_portal_session(org, return_url: "https://app.test/settings")
      }.to raise_error(StripeService::Error, "No Stripe customer for this organization")
    end
  end
end
