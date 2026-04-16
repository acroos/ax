# Pin the Stripe API version explicitly so future stripe-ruby gem upgrades
# don't silently change the wire format. This must match the schema our
# webhook handlers expect.
#
# 2025-04-30.basil moved `current_period_start` / `current_period_end` off
# the Subscription object onto each subscription item. Bumping this version
# requires reviewing every Stripe object access in app/services/stripe_handlers/.
if defined?(Stripe)
  Stripe.api_key = ENV["STRIPE_SECRET_KEY"]
  Stripe.api_version = "2025-04-30.basil"
end
