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

  it "enforces free plan limits when downgrading to free" do
    owner = org.created_by
    create(:org_membership, organization: org, user: owner, role: "owner")
    member = create(:user)
    create(:org_membership, organization: org, user: member, role: "member")
    member_session = UserSession.create!(user: member, expires_at: 30.days.from_now)

    data = {
      id: "sub_test_123",
      status: "unpaid",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    expect(org.org_memberships.reload.map(&:role)).to eq([ "owner" ])
    expect(UserSession.find_by(id: member_session.id)).to be_nil
  end

  it "does not enforce limits when staying on pro" do
    owner = org.created_by
    create(:org_membership, organization: org, user: owner, role: "owner")
    member = create(:user)
    create(:org_membership, organization: org, user: member, role: "member")

    data = {
      id: "sub_test_123",
      status: "active",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    expect(org.org_memberships.reload.count).to eq(2)
  end

  it "skips when subscription not found and no customer match" do
    data = { id: "sub_unknown", status: "active" }

    expect { StripeHandlers::SubscriptionUpdated.new(data).call }.not_to raise_error
    expect(Subscription.find_by(stripe_subscription_id: "sub_unknown")).to be_nil
  end

  context "when subscription.updated arrives before checkout.session.completed" do
    let(:org_with_customer) { create(:organization, plan: "free", stripe_customer_id: "cus_early_123") }

    it "creates a subscription record and applies the update" do
      data = {
        id: "sub_early_456",
        customer: "cus_early_123",
        status: "active",
        cancel_at_period_end: false,
        canceled_at: nil,
        items: {
          data: [ {
            id: "si_early_789",
            quantity: 3,
            current_period_start: Time.current.to_i,
            current_period_end: 1.month.from_now.to_i
          } ]
        }
      }

      # Ensure the org exists before the handler runs
      org_with_customer

      expect {
        StripeHandlers::SubscriptionUpdated.new(data).call
      }.to change(Subscription, :count).by(1)

      sub = Subscription.find_by(stripe_subscription_id: "sub_early_456")
      expect(sub.organization).to eq(org_with_customer)
      expect(sub.status).to eq("active")
      expect(sub.quantity).to eq(3)
      expect(sub.stripe_subscription_item_id).to eq("si_early_789")
      expect(org_with_customer.reload.plan).to eq("pro")
    end

    it "skips creation for canceled subscriptions" do
      org_with_customer

      data = {
        id: "sub_canceled_456",
        customer: "cus_early_123",
        status: "canceled",
        cancel_at_period_end: false,
        canceled_at: Time.current.to_i
      }

      expect {
        StripeHandlers::SubscriptionUpdated.new(data).call
      }.not_to change(Subscription, :count)
    end

    it "handles race with checkout.session.completed gracefully" do
      org_with_customer

      # Simulate checkout.session.completed creating the record first
      existing = create(:subscription,
        organization: org_with_customer,
        stripe_subscription_id: "sub_race_456",
        status: "active",
        quantity: 1
      )

      data = {
        id: "sub_race_456",
        customer: "cus_early_123",
        status: "active",
        cancel_at_period_end: false,
        canceled_at: nil,
        items: {
          data: [ { id: "si_race_789", quantity: 5, current_period_start: Time.current.to_i, current_period_end: 1.month.from_now.to_i } ]
        }
      }

      expect {
        StripeHandlers::SubscriptionUpdated.new(data).call
      }.not_to change(Subscription, :count)

      expect(existing.reload.quantity).to eq(5)
    end
  end

  it "syncs quantity changes from Stripe" do
    data = {
      id: "sub_test_123",
      status: "active",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil,
      items: { data: [ { id: "si_existing", quantity: 7 } ] }
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    expect(subscription.reload.quantity).to eq(7)
  end

  it "preserves quantity when items payload is missing" do
    subscription.update!(quantity: 5)

    data = {
      id: "sub_test_123",
      status: "active",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    expect(subscription.reload.quantity).to eq(5)
  end

  it "backfills the subscription item ID if missing" do
    subscription.update!(stripe_subscription_item_id: nil)

    data = {
      id: "sub_test_123",
      status: "active",
      current_period_start: Time.current.to_i,
      current_period_end: 1.month.from_now.to_i,
      cancel_at_period_end: false,
      canceled_at: nil,
      items: { data: [ { id: "si_backfilled", quantity: 1 } ] }
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    expect(subscription.reload.stripe_subscription_item_id).to eq("si_backfilled")
  end

  it "reads current_period_* from the subscription item (post-basil API)" do
    new_start = 2.days.ago.to_i
    new_end = 28.days.from_now.to_i

    data = {
      id: "sub_test_123",
      status: "active",
      cancel_at_period_end: false,
      canceled_at: nil,
      items: {
        data: [ {
          id: "si_existing",
          quantity: 1,
          current_period_start: new_start,
          current_period_end: new_end
        } ]
      }
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    subscription.reload
    expect(subscription.current_period_start).to be_within(1.second).of(Time.at(new_start))
    expect(subscription.current_period_end).to be_within(1.second).of(Time.at(new_end))
  end

  it "preserves existing periods when payload omits them entirely" do
    original_start = subscription.current_period_start
    original_end = subscription.current_period_end

    data = {
      id: "sub_test_123",
      status: "active",
      cancel_at_period_end: false,
      canceled_at: nil
    }

    StripeHandlers::SubscriptionUpdated.new(data).call

    subscription.reload
    expect(subscription.current_period_start).to be_within(1.second).of(original_start)
    expect(subscription.current_period_end).to be_within(1.second).of(original_end)
  end
end
