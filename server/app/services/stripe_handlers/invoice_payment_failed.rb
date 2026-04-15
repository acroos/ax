module StripeHandlers
  class InvoicePaymentFailed
    def initialize(invoice_data)
      @data = invoice_data
    end

    def call
      customer_id = @data[:customer]
      org = Organization.find_by(stripe_customer_id: customer_id)

      if org
        Rails.logger.warn("Invoice payment failed for org #{org.slug} (customer: #{customer_id})")
      else
        Rails.logger.warn("Invoice payment failed for unknown customer: #{customer_id}")
      end
    end
  end
end
