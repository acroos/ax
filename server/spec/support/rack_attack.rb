# frozen_string_literal: true

RSpec.configure do |config|
  # Enable Rack::Attack only for tests tagged :rack_attack.
  # All other tests disable it to avoid flaky throttle interference.
  config.before(:each) do
    Rack::Attack.enabled = false
  end

  config.before(:each, :rack_attack) do
    Rack::Attack.enabled = true
    Rack::Attack.cache.store.clear
  end

  config.after(:each, :rack_attack) do
    Rack::Attack.reset!
  end
end
