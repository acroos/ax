require "rails_helper"

RSpec.describe "Billing API", type: :request do
  let(:owner) { create(:user) }
  let(:member) { create(:user) }
  let(:org) { create(:organization, created_by: owner, plan: "free", plan_overrides: {}) }

  before do
    create(:org_membership, organization: org, user: owner, role: "owner")
    create(:org_membership, organization: org, user: member, role: "member")
  end

  def session_headers(user)
    session = UserSession.create!(user: user, expires_at: 30.days.from_now)
    { "X-Ax-Session" => session.session_token }
  end

  describe "GET /api/v1/orgs/:slug/billing" do
    it "requires session auth" do
      get "/api/v1/orgs/#{org.slug}/billing"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns billing info for a member" do
      get "/api/v1/orgs/#{org.slug}/billing", headers: session_headers(member)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["plan"]["name"]).to eq("free")
      expect(body["plan"]["capabilities"]["max_members"]).to eq(1)
      expect(body["plan"]["capabilities"]["max_repos"]).to eq(2)
      expect(body["subscription"]).to be_nil
      expect(body["usage"]["members"]).to eq(2)
      expect(body["usage"]["repos"]).to eq(0)
    end

    it "includes subscription info when present" do
      org.update!(plan: "pro")
      create(:subscription, organization: org)

      get "/api/v1/orgs/#{org.slug}/billing", headers: session_headers(owner)

      body = JSON.parse(response.body)
      expect(body["plan"]["name"]).to eq("pro")
      expect(body["subscription"]["status"]).to eq("active")
      expect(body["subscription"]["cancel_at_period_end"]).to be false
    end

    it "includes seat quantity and price for active Pro subscriptions" do
      org.update!(plan: "pro")
      create(:subscription, organization: org, quantity: 4, status: "active")

      get "/api/v1/orgs/#{org.slug}/billing", headers: session_headers(owner)

      body = JSON.parse(response.body)
      expect(body["subscription"]["quantity"]).to eq(4)
      expect(body["subscription"]["seat_price_cents"]).to eq(2000)
      # max_members in plan capabilities reflects seat count
      expect(body["plan"]["capabilities"]["max_members"]).to eq(4)
    end
  end

  describe "POST /api/v1/orgs/:slug/billing/checkout" do
    it "requires admin role" do
      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(member)
      expect(response).to have_http_status(:forbidden)
    end

    it "creates a checkout session and returns URL" do
      checkout_session = double("Stripe::Checkout::Session", url: "https://checkout.stripe.com/test")
      allow(StripeService).to receive(:create_checkout_session).and_return(checkout_session)

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["url"]).to eq("https://checkout.stripe.com/test")
    end

    it "rejects checkout when org has an active subscription" do
      create(:subscription, organization: org, status: "active")

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:unprocessable_entity)
      body = JSON.parse(response.body)
      expect(body["error"]).to eq("Organization already has an active subscription")
    end

    it "rejects checkout when org has a trialing subscription" do
      create(:subscription, organization: org, status: "trialing")

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:unprocessable_entity)
      body = JSON.parse(response.body)
      expect(body["error"]).to eq("Organization already has an active subscription")
    end

    it "allows checkout when subscription is canceled" do
      create(:subscription, organization: org, status: "canceled")
      checkout_session = double("Stripe::Checkout::Session", url: "https://checkout.stripe.com/test")
      allow(StripeService).to receive(:create_checkout_session).and_return(checkout_session)

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:ok)
    end

    it "rejects checkout when Stripe reports an active subscription on the customer (no local row)" do
      org.update!(stripe_customer_id: "cus_test_123")
      stripe_sub = double("Stripe::Subscription", status: "active")
      list = double("Stripe::ListObject", data: [ stripe_sub ])
      allow(Stripe::Subscription).to receive(:list).with(
        customer: "cus_test_123", status: "all", limit: 100
      ).and_return(list)

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "allows checkout when Stripe reports only canceled subscriptions on the customer" do
      org.update!(stripe_customer_id: "cus_test_123")
      stripe_sub = double("Stripe::Subscription", status: "canceled")
      list = double("Stripe::ListObject", data: [ stripe_sub ])
      allow(Stripe::Subscription).to receive(:list).and_return(list)

      checkout_session = double("Stripe::Checkout::Session", url: "https://checkout.stripe.com/test")
      allow(StripeService).to receive(:create_checkout_session).and_return(checkout_session)

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:ok)
    end

    it "fails closed when the Stripe API call errors" do
      org.update!(stripe_customer_id: "cus_test_123")
      allow(Stripe::Subscription).to receive(:list).and_raise(Stripe::APIError.new("network down"))

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "skips the Stripe lookup when the org has no Stripe customer yet" do
      expect(Stripe::Subscription).not_to receive(:list)
      checkout_session = double("Stripe::Checkout::Session", url: "https://checkout.stripe.com/test")
      allow(StripeService).to receive(:create_checkout_session).and_return(checkout_session)

      post "/api/v1/orgs/#{org.slug}/billing/checkout", headers: session_headers(owner)

      expect(response).to have_http_status(:ok)
    end
  end

  describe "POST /api/v1/orgs/:slug/billing/reconcile" do
    let(:stripe_item) do
      double("Stripe::SubscriptionItem",
        id: "si_test_456",
        quantity: 1,
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

    def stripe_session_double(org_id:, subscription_id: "sub_test_123")
      double(
        "Stripe::Checkout::Session",
        metadata: { org_id: org_id.to_s },
        subscription: subscription_id,
        to_json: { metadata: { org_id: org_id.to_s }, subscription: subscription_id }.to_json
      )
    end

    it "requires admin role" do
      post "/api/v1/orgs/#{org.slug}/billing/reconcile?session_id=cs_test_1", headers: session_headers(member)
      expect(response).to have_http_status(:forbidden)
    end

    it "returns bad_request when session_id is missing" do
      post "/api/v1/orgs/#{org.slug}/billing/reconcile", headers: session_headers(owner)
      expect(response).to have_http_status(:bad_request)
    end

    it "upgrades the org synchronously when the session belongs to the org" do
      session = stripe_session_double(org_id: org.id)
      allow(Stripe::Checkout::Session).to receive(:retrieve).with("cs_test_1").and_return(session)
      allow(Stripe::Subscription).to receive(:retrieve).with("sub_test_123").and_return(stripe_sub)

      post "/api/v1/orgs/#{org.slug}/billing/reconcile?session_id=cs_test_1", headers: session_headers(owner)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["plan"]).to eq("pro")
      expect(org.reload.plan).to eq("pro")
      expect(Subscription.find_by(stripe_subscription_id: "sub_test_123")).to be_present
    end

    it "rejects when session metadata.org_id does not match the URL org" do
      other_org = create(:organization)
      session = stripe_session_double(org_id: other_org.id)
      allow(Stripe::Checkout::Session).to receive(:retrieve).and_return(session)

      post "/api/v1/orgs/#{org.slug}/billing/reconcile?session_id=cs_test_1", headers: session_headers(owner)

      expect(response).to have_http_status(:forbidden)
      expect(org.reload.plan).to eq("free")
    end

    it "is idempotent with the webhook (no duplicate subscription rows)" do
      session = stripe_session_double(org_id: org.id)
      allow(Stripe::Checkout::Session).to receive(:retrieve).and_return(session)
      allow(Stripe::Subscription).to receive(:retrieve).and_return(stripe_sub)

      post "/api/v1/orgs/#{org.slug}/billing/reconcile?session_id=cs_test_1", headers: session_headers(owner)
      post "/api/v1/orgs/#{org.slug}/billing/reconcile?session_id=cs_test_1", headers: session_headers(owner)

      expect(Subscription.where(stripe_subscription_id: "sub_test_123").count).to eq(1)
    end

    it "returns unprocessable_entity on Stripe error" do
      allow(Stripe::Checkout::Session).to receive(:retrieve).and_raise(Stripe::APIError.new("boom"))

      post "/api/v1/orgs/#{org.slug}/billing/reconcile?session_id=cs_test_1", headers: session_headers(owner)

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "POST /api/v1/orgs/:slug/billing/portal" do
    it "requires admin role" do
      post "/api/v1/orgs/#{org.slug}/billing/portal", headers: session_headers(member)
      expect(response).to have_http_status(:forbidden)
    end

    it "creates a portal session and returns URL" do
      org.update!(stripe_customer_id: "cus_test_123")
      portal_session = double("Stripe::BillingPortal::Session", url: "https://billing.stripe.com/test")
      allow(StripeService).to receive(:create_portal_session).and_return(portal_session)

      post "/api/v1/orgs/#{org.slug}/billing/portal", headers: session_headers(owner)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["url"]).to eq("https://billing.stripe.com/test")
    end

    it "returns error when no Stripe customer exists" do
      allow(StripeService).to receive(:create_portal_session).and_raise(StripeService::Error, "No Stripe customer for this organization")

      post "/api/v1/orgs/#{org.slug}/billing/portal", headers: session_headers(owner)

      expect(response).to have_http_status(:unprocessable_entity)
      body = JSON.parse(response.body)
      expect(body["error"]).to include("No Stripe customer")
    end
  end
end
