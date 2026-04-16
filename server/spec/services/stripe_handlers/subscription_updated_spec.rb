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

  it "skips when subscription not found" do
    data = { id: "sub_unknown", status: "active" }

    expect { StripeHandlers::SubscriptionUpdated.new(data).call }.not_to raise_error
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
