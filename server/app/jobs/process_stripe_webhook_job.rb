class ProcessStripeWebhookJob < ApplicationJob
  queue_as :webhooks

  def perform(event_type, object_json, event_id)
    object = JSON.parse(object_json, symbolize_names: true)

    case event_type
    when "checkout.session.completed"
      StripeHandlers::CheckoutCompleted.new(object).call
    when "customer.subscription.updated"
      StripeHandlers::SubscriptionUpdated.new(object).call
    when "customer.subscription.deleted"
      StripeHandlers::SubscriptionDeleted.new(object).call
    when "invoice.payment_failed"
      StripeHandlers::InvoicePaymentFailed.new(object).call
    else
      Rails.logger.info("Unhandled Stripe event: #{event_type} (#{event_id})")
    end
  end
end
