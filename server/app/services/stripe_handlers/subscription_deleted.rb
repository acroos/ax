module StripeHandlers
  class SubscriptionDeleted
    def initialize(subscription_data)
      @data = subscription_data
    end

    def call
      subscription = Subscription.find_by(stripe_subscription_id: @data[:id])
      return unless subscription

      subscription.update!(
        status: "canceled",
        canceled_at: @data[:canceled_at] ? Time.at(@data[:canceled_at]) : Time.current
      )

      org = subscription.organization
      org.update!(plan: "free")

      Rails.logger.info("Subscription #{@data[:id]} deleted — org #{org.slug} reverted to free")
    end
  end
end
