class PlanService
  def self.for(org)
    new(org)
  end

  def initialize(org)
    @org = org
    @plan_name = org.plan || "free"
    @base = PLANS[@plan_name] || PLANS["free"]
    @overrides = (org.respond_to?(:plan_overrides) && org.plan_overrides.present?) ? org.plan_overrides.symbolize_keys : {}
  end

  def capability(key)
    key = key.to_sym
    @overrides.key?(key) ? @overrides[key] : @base[key]
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

    {
      name: @plan_name,
      capabilities: caps
    }
  end
end
