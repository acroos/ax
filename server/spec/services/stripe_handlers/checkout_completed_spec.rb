require "rails_helper"

RSpec.describe StripeHandlers::CheckoutCompleted do
  let(:org) { create(:organization, plan: "free", plan_overrides: {}) }

  let(:stripe_sub) do
    double("Stripe::Subscription",
      status: "active",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false
    )
  end

  before do
    allow(Stripe::Subscription).to receive(:retrieve).and_return(stripe_sub)
  end

  it "creates a subscription and upgrades org to pro" do
    session = {
      metadata: { org_id: org.id.to_s },
      subscription: "sub_test_123"
    }

    StripeHandlers::CheckoutCompleted.new(session).call

    expect(org.reload.plan).to eq("pro")
    sub = Subscription.find_by(stripe_subscription_id: "sub_test_123")
    expect(sub).to be_present
    expect(sub.organization).to eq(org)
    expect(sub.status).to eq("active")
  end

  it "is idempotent — does not duplicate subscription on re-delivery" do
    session = {
      metadata: { org_id: org.id.to_s },
      subscription: "sub_test_123"
    }

    StripeHandlers::CheckoutCompleted.new(session).call
    StripeHandlers::CheckoutCompleted.new(session).call

    expect(Subscription.where(stripe_subscription_id: "sub_test_123").count).to eq(1)
  end

  it "skips when org_id is missing from metadata" do
    session = { metadata: {}, subscription: "sub_test_123" }

    expect { StripeHandlers::CheckoutCompleted.new(session).call }.not_to change(Subscription, :count)
  end

  it "skips when org does not exist" do
    session = {
      metadata: { org_id: "999999" },
      subscription: "sub_test_123"
    }

    expect { StripeHandlers::CheckoutCompleted.new(session).call }.not_to change(Subscription, :count)
  end
end
