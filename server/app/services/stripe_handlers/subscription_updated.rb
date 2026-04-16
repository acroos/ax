module StripeHandlers
  class SubscriptionUpdated
    def initialize(subscription_data)
      @data = subscription_data
    end

    def call
      subscription = Subscription.find_by(stripe_subscription_id: @data[:id])
      return unless subscription

      item = @data.dig(:items, :data, 0)
      attrs = {
        status: @data[:status],
        current_period_start: @data[:current_period_start] ? Time.at(@data[:current_period_start]) : nil,
        current_period_end: @data[:current_period_end] ? Time.at(@data[:current_period_end]) : nil,
        cancel_at_period_end: @data[:cancel_at_period_end] || false,
        canceled_at: @data[:canceled_at] ? Time.at(@data[:canceled_at]) : nil
      }
      attrs[:quantity] = item[:quantity] if item && item[:quantity]
      attrs[:stripe_subscription_item_id] = item[:id] if item && item[:id] && subscription.stripe_subscription_item_id.blank?

      subscription.update!(attrs)

      org = subscription.organization
      new_plan = plan_for_status(@data[:status])
      if org.plan != new_plan
        org.update!(plan: new_plan)
        org.enforce_free_plan_limits! if new_plan == "free"
      end

      Rails.logger.info("Subscription #{@data[:id]} updated — status: #{@data[:status]}, org plan: #{new_plan}")
    end

    private

    def plan_for_status(status)
      case status
      when "active", "trialing", "past_due"
        "pro"
      else
        "free"
      end
    end
  end
end
