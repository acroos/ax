# Stripe Test Setup

How to set up Stripe in test mode to test the billing flow without paying.

## 1. Create Stripe account

Go to https://dashboard.stripe.com/register and sign up. Once in, make sure **Test mode** is toggled on (top-right corner of the dashboard). All test-mode URLs have `/test/` in the path.

## 2. Create the "AX Pro" product

1. Go to https://dashboard.stripe.com/test/products
2. Click **+ Add product**
3. Name: `AX Pro`
4. Pricing: **Recurring**, pick your interval (monthly), set a price
5. Save — copy the **Price ID** (`price_xxx`) from the product detail page

## 3. Get your API secret key

1. Go to https://dashboard.stripe.com/test/apikeys
2. Click **Reveal test key** next to the Secret key
3. Copy the `sk_test_xxx` value

## 4. Create the webhook endpoint

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **+ Add endpoint**
3. URL: `https://ax.up.railway.app/webhooks/stripe`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. After creating, click **Reveal** under "Signing secret" — copy the `whsec_xxx` value

## 5. Configure the Customer Portal

1. Go to https://dashboard.stripe.com/test/settings/billing/portal
2. Enable: **Cancel subscription**, **Update payment method**
3. Save

## 6. Set environment variables on Railway

Add these four vars to the Rails server on Railway:

```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRO_PRICE_ID=price_xxx
DASHBOARD_URL=https://ax-metrics.vercel.app
```

Then run the migration if it hasn't run automatically:

```bash
rails db:migrate
```

## 7. Test the flow

1. Go to `https://ax-metrics.vercel.app/{your-org}/billing`
2. Click **Upgrade to Pro**
3. On the Stripe Checkout page, use test card `4242 4242 4242 4242` with any future expiry, any CVC, any ZIP
4. Complete payment — you'll be redirected back with a success banner
5. Verify your org is now on the Pro plan
6. Click **Manage Billing** to confirm the Customer Portal opens

### Test card numbers

| Card | Behavior |
|------|----------|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 3220` | Triggers 3D Secure |
| `4000 0000 0000 9995` | Declines (insufficient funds) |
| `4000 0000 0000 0341` | Attaches but fails on charge |

## Local webhook testing (optional)

If you want to test webhooks locally instead of going through Railway:

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
```

This prints a local `whsec_xxx` — use that as your `STRIPE_WEBHOOK_SECRET` in your local dev environment. It's different from the dashboard webhook secret.

You can also trigger test events manually:

```bash
stripe trigger checkout.session.completed
```

## Skip Stripe entirely (for dev)

To make yourself Pro without setting up Stripe at all:

```bash
rails "ax:set_plan[your-org-slug,pro]"
```

Or grant a specific override:

```bash
rails "ax:override[your-org-slug,max_repos,10]"
```
