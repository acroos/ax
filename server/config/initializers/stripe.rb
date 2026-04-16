# Pin the Stripe API version explicitly so future stripe-ruby gem upgrades
# don't silently change the wire format. This must match the version
# configured on the Stripe webhook endpoint in the dashboard.
#
# Override per-environment with STRIPE_API_VERSION. The default tracks the
# version we currently target in production. Bumping it requires reviewing
# every Stripe object access in app/services/stripe_handlers/ — for example,
# 2025-04-30.basil moved `current_period_start` / `current_period_end` off
# the Subscription object onto each subscription item.
if defined?(Stripe)
  Stripe.api_key = ENV["STRIPE_SECRET_KEY"]
  Stripe.api_version = ENV.fetch("STRIPE_API_VERSION", "2026-03-25.dahlia")
end
