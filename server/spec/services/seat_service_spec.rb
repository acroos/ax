require "rails_helper"

RSpec.describe SeatService do
  let(:org) { create(:organization, plan: "pro") }

  describe ".add_seat!" do
    it "increments quantity by 1 with prorations" do
      sub = create(:subscription, organization: org, quantity: 3, status: "active")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.add_seat!(org.reload)

      expect(StripeService).to have_received(:update_seat_count).with(
        sub, 4, proration_behavior: "create_prorations"
      )
    end

    it "no-ops when org has no subscription (free plan)" do
      free_org = create(:organization, plan: "free")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.add_seat!(free_org)

      expect(StripeService).not_to have_received(:update_seat_count)
    end

    it "no-ops when subscription is canceled" do
      create(:subscription, organization: org, quantity: 3, status: "canceled")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.add_seat!(org.reload)

      expect(StripeService).not_to have_received(:update_seat_count)
    end

    it "works for trialing subscriptions" do
      sub = create(:subscription, organization: org, quantity: 2, status: "trialing")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.add_seat!(org.reload)

      expect(StripeService).to have_received(:update_seat_count).with(
        sub, 3, proration_behavior: "create_prorations"
      )
    end

    it "propagates Stripe errors so callers can roll back" do
      create(:subscription, organization: org, quantity: 3, status: "active")
      allow(StripeService).to receive(:update_seat_count).and_raise(StripeService::Error, "boom")

      expect { SeatService.add_seat!(org.reload) }.to raise_error(StripeService::Error)
    end
  end

  describe ".remove_seat!" do
    it "decrements quantity by 1 with no proration" do
      sub = create(:subscription, organization: org, quantity: 5, status: "active")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.remove_seat!(org.reload)

      expect(StripeService).to have_received(:update_seat_count).with(
        sub, 4, proration_behavior: "none"
      )
    end

    it "does not go below 1" do
      create(:subscription, organization: org, quantity: 1, status: "active")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.remove_seat!(org.reload)

      expect(StripeService).not_to have_received(:update_seat_count)
    end

    it "no-ops when org has no subscription" do
      free_org = create(:organization, plan: "free")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.remove_seat!(free_org)

      expect(StripeService).not_to have_received(:update_seat_count)
    end

    it "no-ops when subscription is canceled" do
      create(:subscription, organization: org, quantity: 5, status: "canceled")
      allow(StripeService).to receive(:update_seat_count)

      SeatService.remove_seat!(org.reload)

      expect(StripeService).not_to have_received(:update_seat_count)
    end

    it "retries once on transient Stripe connection errors" do
      sub = create(:subscription, organization: org, quantity: 3, status: "active")
      call_count = 0
      allow(StripeService).to receive(:update_seat_count) do
        call_count += 1
        raise Stripe::APIConnectionError, "timeout" if call_count == 1
      end

      SeatService.remove_seat!(org.reload)

      expect(StripeService).to have_received(:update_seat_count).twice
    end

    it "gives up after two consecutive failures without raising" do
      create(:subscription, organization: org, quantity: 3, status: "active")
      allow(StripeService).to receive(:update_seat_count)
        .and_raise(Stripe::APIConnectionError, "timeout")

      expect { SeatService.remove_seat!(org.reload) }.not_to raise_error

      expect(StripeService).to have_received(:update_seat_count).twice
    end
  end
end
