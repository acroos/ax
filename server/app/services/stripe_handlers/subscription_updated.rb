module StripeHandlers
  class SubscriptionUpdated
    def initialize(subscription_data)
      @data = subscription_data
    end

    def call
      subscription = Subscription.find_by(stripe_subscription_id: @data[:id])
      subscription ||= create_from_stripe_data
      return unless subscription

      item = @data.dig(:items, :data, 0)
      attrs = {
        status: @data[:status],
        current_period_start: period_time(item, :current_period_start),
        current_period_end: period_time(item, :current_period_end),
        cancel_at_period_end: @data[:cancel_at_period_end] || false,
        canceled_at: @data[:canceled_at] ? Time.at(@data[:canceled_at]) : nil
      }
      attrs[:quantity] = item[:quantity] if item && item[:quantity]
      attrs[:stripe_subscription_item_id] = item[:id] if item && item[:id] && subscription.stripe_subscription_item_id.blank?

      # Don't clobber existing periods with nil if the payload doesn't carry them
      # (e.g., events that touch the subscription without re-emitting items).
      attrs.delete(:current_period_start) if attrs[:current_period_start].nil? && subscription.current_period_start.present?
      attrs.delete(:current_period_end) if attrs[:current_period_end].nil? && subscription.current_period_end.present?

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

    # Stripe API 2025-04-30.basil moved current_period_start/end from the
    # Subscription object onto each subscription item. This reads from the
    # item with safe nil handling and falls back to the legacy top-level
    # field if a (very old) payload still carries it.
    def period_time(item, attr)
      epoch = item && item[attr]
      epoch ||= @data[attr] # backwards compat with pre-basil payloads
      epoch ? Time.at(epoch) : nil
    end

    # When subscription.updated arrives before checkout.session.completed,
    # no local Subscription record exists yet. Create a minimal one from
    # the webhook data so the update isn't silently lost.
    def create_from_stripe_data
      return if @data[:status] == "canceled"

      customer_id = @data[:customer]
      return unless customer_id

      org = Organization.find_by(stripe_customer_id: customer_id)
      return unless org

      item = @data.dig(:items, :data, 0)
      Subscription.create!(
        organization: org,
        stripe_subscription_id: @data[:id],
        stripe_subscription_item_id: item&.dig(:id),
        status: @data[:status],
        quantity: item&.dig(:quantity) || 1,
        current_period_start: period_time(item, :current_period_start),
        current_period_end: period_time(item, :current_period_end),
        cancel_at_period_end: @data[:cancel_at_period_end] || false,
        canceled_at: @data[:canceled_at] ? Time.at(@data[:canceled_at]) : nil
      )
    rescue ActiveRecord::RecordNotUnique
      # checkout.session.completed raced us — use the record it created
      Subscription.find_by(stripe_subscription_id: @data[:id])
    end

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
