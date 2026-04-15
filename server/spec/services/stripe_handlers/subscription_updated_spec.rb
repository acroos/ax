require "rails_helper"

RSpec.describe StripeHandlers::SubscriptionUpdated do
  let(:org) { create(:organization, plan: "pro", plan_overrides: {}) }
  let!(:subscription) { create(:subscription, organization: org, stripe_subscription_id: "sub_test_123") }

  it "syncs subscription fields and keeps pro for active status" do
    data = {
      id: "sub_test_123",
      status: "active",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    subscription.reload
    expect(subscription.status).to eq("active")
    expect(subscription.cancel_at_period_end).to be false
    expect(org.reload.plan).to eq("pro")
  end

  it "keeps pro for past_due status" do
    data = {
      id: "sub_test_123",
      status: "past_due",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil
    }

    StripeHandlers::SubscriptionUpdated.new(data).call
    expect(org.reload.plan).to eq("pro")
  end

  it "reverts to free for unpaid status" do
    data = {
      id: "sub_test_123",
      status: "unpaid",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil
    }

    StripeHandlers::SubscriptionUpdated.new(data).call
    expect(org.reload.plan).to eq("free")
  end

  it "updates cancel_at_period_end" do
    data = {
      id: "sub_test_123",
      status: "active",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: true,
      canceled_at: Time.current.to_i
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    subscription.reload
    expect(subscription.cancel_at_period_end).to be true
    expect(subscription.canceled_at).to be_present
    expect(org.reload.plan).to eq("pro") # still pro until period ends
  end

  it "skips when subscription not found" do
    data = { id: "sub_unknown", status: "active" }

    expect { StripeHandlers::SubscriptionUpdated.new(data).call }.not_to raise_error
  end
end
