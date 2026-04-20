module StripeHandlers
  class InvoicePaymentFailed
    def initialize(invoice_data)
      @data = invoice_data
    end

    def call
      customer_id = @data[:customer]
      org = Organization.find_by(stripe_customer_id: customer_id)

      unless org
        Rails.logger.warn("Invoice payment failed for unknown customer: #{customer_id}")
        return
      end

      subscription = org.subscription
      if subscription && subscription.status != "past_due"
        subscription.update!(status: "past_due")
        Rails.logger.warn("Invoice payment failed for org #{org.slug} — subscription marked past_due")
      else
        Rails.logger.warn("Invoice payment failed for org #{org.slug} (customer: #{customer_id})")
      end
    end
  end
end
