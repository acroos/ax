require "rails_helper"

RSpec.describe StripeHandlers::CheckoutCompleted do
  let(:org) { create(:organization, plan: "free", plan_overrides: {}) }

  # Stripe API 2025-04-30.basil: current_period_* live on the subscription
  # item, not on the subscription. The double mirrors that shape.
  let(:stripe_item) do
    double("Stripe::SubscriptionItem",
      id: "si_test_456",
      quantity: 3,
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i
    )
  end
  let(:stripe_items) { double("Stripe::ListObject", data: [ stripe_item ]) }

  let(:stripe_sub) do
    double("Stripe::Subscription",
      status: "active",
      cancel_at_period_end: false,
      items: stripe_items
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

  it "stores the subscription item ID and quantity from Stripe" do
    session = {
      metadata: { org_id: org.id.to_s },
      subscription: "sub_test_123"
    }

    StripeHandlers::CheckoutCompleted.new(session).call

    sub = Subscription.find_by(stripe_subscription_id: "sub_test_123")
    expect(sub.stripe_subscription_item_id).to eq("si_test_456")
    expect(sub.quantity).to eq(3)
  end

  it "stores current_period_start/end from the subscription item (post-basil API)" do
    session = {
      metadata: { org_id: org.id.to_s },
      subscription: "sub_test_123"
    }

    StripeHandlers::CheckoutCompleted.new(session).call

    sub = Subscription.find_by(stripe_subscription_id: "sub_test_123")
    expect(sub.current_period_start).to be_within(1.second).of(Time.current)
    expect(sub.current_period_end).to be_within(1.second).of(1.month.from_now)
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

  it "skips when the Stripe subscription is already canceled" do
    canceled_sub = double("Stripe::Subscription",
      status: "canceled",
      cancel_at_period_end: false,
      items: stripe_items
    )
    allow(Stripe::Subscription).to receive(:retrieve).and_return(canceled_sub)

    session = {
      metadata: { org_id: org.id.to_s },
      subscription: "sub_test_123"
    }

    expect { StripeHandlers::CheckoutCompleted.new(session).call }.not_to change(Subscription, :count)
    expect(org.reload.plan).to eq("free")
  end
end
