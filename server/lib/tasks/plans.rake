namespace :ax do
  desc "Set an organization's plan (e.g., rails ax:set_plan[org-slug,pro])"
  task :set_plan, [ :org_slug, :plan ] => :environment do |_t, args|
    slug = args[:org_slug]
    plan = args[:plan]

    if slug.blank? || plan.blank?
      puts "Usage: rails ax:set_plan[org-slug,plan]"
      puts "Available plans: #{PLANS.keys.join(', ')}"
      next
    end

    org = Organization.find_by(slug: slug)
    unless org
      puts "Organization '#{slug}' not found."
      next
    end

    unless PLANS.key?(plan)
      puts "Unknown plan '#{plan}'. Available: #{PLANS.keys.join(', ')}"
      next
    end

    org.update!(plan: plan)
    puts "Set plan for '#{slug}' to '#{plan}'."
  end

  desc "Set a per-org capability override (e.g., rails ax:override[org-slug,max_repos,10])"
  task :override, [ :org_slug, :key, :value ] => :environment do |_t, args|
    slug = args[:org_slug]
    key = args[:key]
    raw_value = args[:value]

    if slug.blank? || key.blank? || raw_value.nil?
      puts "Usage: rails ax:override[org-slug,capability_key,value]"
      puts "Examples:"
      puts "  rails ax:override[my-org,max_repos,10]"
      puts "  rails ax:override[my-org,export_data,true]"
      next
    end

    org = Organization.find_by(slug: slug)
    unless org
      puts "Organization '#{slug}' not found."
      next
    end

    # Parse value: numeric, boolean, or string
    value = case raw_value
    when /\A\d+\z/ then raw_value.to_i
    when /\A\d+\.\d+\z/ then raw_value.to_f
    when "true" then true
    when "false" then false
    else raw_value
    end

    overrides = org.plan_overrides.merge(key => value)
    org.update!(plan_overrides: overrides)
    puts "Set override '#{key}' = #{value.inspect} for '#{slug}'."
    puts "Effective capabilities: #{PlanService.for(org).plan_details[:capabilities]}"
  end
end
