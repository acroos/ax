require "rails_helper"

RSpec.describe ReconcileSubscriptionSeatsJob do
  describe "#perform" do
    it "adjusts seat quantity when it exceeds member count" do
      org = create(:organization, plan: "pro")
      owner = create(:user)
      create(:org_membership, organization: org, user: owner, role: "owner")
      sub = create(:subscription, organization: org, quantity: 5, status: "active")

      allow(StripeService).to receive(:update_seat_count)

      described_class.new.perform

      expect(StripeService).to have_received(:update_seat_count).with(
        sub, 1, proration_behavior: "none"
      )
    end

    it "adjusts seat quantity when it is below member count" do
      org = create(:organization, plan: "pro")
      owner = create(:user)
      create(:org_membership, organization: org, user: owner, role: "owner")
      member = create(:user)
      create(:org_membership, organization: org, user: member, role: "member")
      sub = create(:subscription, organization: org, quantity: 1, status: "active")

      allow(StripeService).to receive(:update_seat_count)

      described_class.new.perform

      expect(StripeService).to have_received(:update_seat_count).with(
        sub, 2, proration_behavior: "create_prorations"
      )
    end

    it "skips subscriptions that are already in sync" do
      org = create(:organization, plan: "pro")
      owner = create(:user)
      create(:org_membership, organization: org, user: owner, role: "owner")
      create(:subscription, organization: org, quantity: 1, status: "active")

      allow(StripeService).to receive(:update_seat_count)

      described_class.new.perform

      expect(StripeService).not_to have_received(:update_seat_count)
    end

    it "skips canceled subscriptions" do
      org = create(:organization, plan: "free")
      create(:subscription, organization: org, quantity: 5, status: "canceled")

      allow(StripeService).to receive(:update_seat_count)

      described_class.new.perform

      expect(StripeService).not_to have_received(:update_seat_count)
    end

    it "continues processing other subscriptions when one fails" do
      org1 = create(:organization, plan: "pro")
      owner1 = create(:user)
      create(:org_membership, organization: org1, user: owner1, role: "owner")
      create(:subscription, organization: org1, quantity: 5, status: "active")

      org2 = create(:organization, plan: "pro")
      owner2 = create(:user)
      create(:org_membership, organization: org2, user: owner2, role: "owner")
      sub2 = create(:subscription, organization: org2, quantity: 3, status: "active")

      call_count = 0
      allow(StripeService).to receive(:update_seat_count) do
        call_count += 1
        raise StripeService::Error, "boom" if call_count == 1
      end

      expect { described_class.new.perform }.not_to raise_error

      # Both were attempted (one failed, one succeeded)
      expect(StripeService).to have_received(:update_seat_count).twice
    end

    it "enforces minimum quantity of 1 for orgs with no members" do
      org = create(:organization, plan: "pro")
      create(:subscription, organization: org, quantity: 1, status: "active")

      allow(StripeService).to receive(:update_seat_count)

      described_class.new.perform

      expect(StripeService).not_to have_received(:update_seat_count)
    end
  end
end
