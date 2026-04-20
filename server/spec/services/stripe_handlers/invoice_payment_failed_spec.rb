require "rails_helper"

RSpec.describe StripeHandlers::InvoicePaymentFailed do
  let(:org) { create(:organization, plan: "pro", stripe_customer_id: "cus_test_123") }

  it "marks the subscription as past_due" do
    subscription = create(:subscription, organization: org, status: "active")
    data = { customer: "cus_test_123" }

    StripeHandlers::InvoicePaymentFailed.new(data).call

    expect(subscription.reload.status).to eq("past_due")
  end

  it "does not change status when already past_due" do
    subscription = create(:subscription, organization: org, status: "past_due")
    data = { customer: "cus_test_123" }

    expect {
      StripeHandlers::InvoicePaymentFailed.new(data).call
    }.not_to change { subscription.reload.updated_at }
  end

  it "logs and returns when customer is unknown" do
    data = { customer: "cus_unknown" }

    expect {
      StripeHandlers::InvoicePaymentFailed.new(data).call
    }.not_to raise_error
  end

  it "handles org with no subscription" do
    data = { customer: "cus_test_123" }

    expect {
      StripeHandlers::InvoicePaymentFailed.new(data).call
    }.not_to raise_error
  end
end
