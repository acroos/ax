require "rails_helper"

RSpec.describe StripeHandlers::SubscriptionDeleted do
  let(:org) { create(:organization, plan: "pro", plan_overrides: {}) }
  let!(:subscription) { create(:subscription, organization: org, stripe_subscription_id: "sub_test_123") }

  it "marks subscription as canceled and reverts org to free" do
    data = {
      id: "sub_test_123",
      canceled_at: Time.current.to_i
    }

    StripeHandlers::SubscriptionDeleted.new(data).call

    subscription.reload
    expect(subscription.status).to eq("canceled")
    expect(subscription.canceled_at).to be_present
    expect(org.reload.plan).to eq("free")
  end

  it "skips when subscription not found" do
    data = { id: "sub_unknown", canceled_at: Time.current.to_i }

    expect { StripeHandlers::SubscriptionDeleted.new(data).call }.not_to raise_error
  end
end
