class PlanService
  def self.for(org)
    new(org)
  end

  def initialize(org)
    @org = org
    @plan_name = org.plan || "free"
    @base = PLANS[@plan_name] || PLANS["free"]
    @overrides = (org.respond_to?(:plan_overrides) && org.plan_overrides.present?) ? org.plan_overrides.symbolize_keys : {}
    @subscription = org.subscription if org.respond_to?(:subscription)
  end

  def capability(key)
    key = key.to_sym
    return @overrides[key] if @overrides.key?(key)

    if key == :max_members && seat_based_max_members?
      return @subscription.quantity
    end

    @base[key]
  end

  def can?(key)
    !!capability(key)
  end

  def within_limit?(key, current_count)
    max = capability(key)
    return true if max == Float::INFINITY
    return true unless max.is_a?(Numeric)
    current_count < max
  end

  def plan_name
    @plan_name
  end

  def plan_details
    caps = @base.merge(@overrides).transform_values do |v|
      v == Float::INFINITY ? nil : v
    end

    if seat_based_max_members? && !@overrides.key?(:max_members)
      caps[:max_members] = @subscription.quantity
    end

    {
      name: @plan_name,
      capabilities: caps
    }
  end

  private

  # On Pro, the effective max_members comes from the subscription's seat
  # quantity rather than the static config. Falls back to the static config
  # when the subscription is missing or inactive (e.g., during a brief
  # window between checkout and webhook arrival).
  def seat_based_max_members?
    @plan_name == "pro" && @subscription&.active_or_trialing?
  end
end
