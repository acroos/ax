require "rails_helper"

RSpec.describe ProcessStripeWebhookJob do
  let(:event_id) { "evt_test_#{SecureRandom.hex(8)}" }
  let(:object_json) { { metadata: { org_id: 1 }, subscription: "sub_123" }.to_json }

  describe "idempotency" do
    it "processes a new event and records it" do
      expect_any_instance_of(StripeHandlers::CheckoutCompleted).to receive(:call)

      described_class.new.perform("checkout.session.completed", object_json, event_id)

      expect(ProcessedStripeEvent.exists?(event_id: event_id)).to be true
    end

    it "skips an already-processed event" do
      ProcessedStripeEvent.create!(event_id: event_id)

      expect(StripeHandlers::CheckoutCompleted).not_to receive(:new)

      described_class.new.perform("checkout.session.completed", object_json, event_id)
    end

    it "is safe when the same event is performed twice" do
      expect_any_instance_of(StripeHandlers::CheckoutCompleted).to receive(:call).once

      described_class.new.perform("checkout.session.completed", object_json, event_id)
      described_class.new.perform("checkout.session.completed", object_json, event_id)

      expect(ProcessedStripeEvent.where(event_id: event_id).count).to eq(1)
    end

    it "records separate entries for different event IDs" do
      other_event_id = "evt_other_#{SecureRandom.hex(8)}"

      expect_any_instance_of(StripeHandlers::CheckoutCompleted).to receive(:call)
      described_class.new.perform("checkout.session.completed", object_json, event_id)

      expect_any_instance_of(StripeHandlers::SubscriptionUpdated).to receive(:call)
      described_class.new.perform("customer.subscription.updated", object_json, other_event_id)

      expect(ProcessedStripeEvent.count).to eq(2)
    end
  end

  describe "event routing" do
    it "routes checkout.session.completed" do
      expect_any_instance_of(StripeHandlers::CheckoutCompleted).to receive(:call)
      described_class.new.perform("checkout.session.completed", object_json, event_id)
    end

    it "routes customer.subscription.updated" do
      expect_any_instance_of(StripeHandlers::SubscriptionUpdated).to receive(:call)
      described_class.new.perform("customer.subscription.updated", object_json, event_id)
    end

    it "routes customer.subscription.deleted" do
      expect_any_instance_of(StripeHandlers::SubscriptionDeleted).to receive(:call)
      described_class.new.perform("customer.subscription.deleted", object_json, event_id)
    end

    it "routes invoice.payment_failed" do
      expect_any_instance_of(StripeHandlers::InvoicePaymentFailed).to receive(:call)
      described_class.new.perform("invoice.payment_failed", object_json, event_id)
    end

    it "logs unhandled event types without raising" do
      expect {
        described_class.new.perform("unknown.event", object_json, event_id)
      }.not_to raise_error

      expect(ProcessedStripeEvent.exists?(event_id: event_id)).to be true
    end
  end
end
