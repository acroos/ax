# frozen_string_literal: true

class Rack::Attack
  # --- Cache store ---
  # Production uses Rails.cache (Solid Cache, DB-backed).
  # Dev/test use MemoryStore so throttle counters work without Solid Cache.
  Rack::Attack.cache.store = if Rails.env.production?
    Rails.cache
  else
    ActiveSupport::Cache::MemoryStore.new
  end

  # --- Safelists ---

  # Never throttle health checks
  safelist("health-checks") do |req|
    req.path == "/up" || req.path == "/api/v1/health"
  end

  # Safelist localhost in development
  safelist("localhost-dev") do |req|
    Rails.env.development? && (req.ip == "127.0.0.1" || req.ip == "::1")
  end

  # --- Throttles ---

  # Auth endpoints: 60 req/min by IP
  # Covers Devise (/users/), session management (/auth/), and API key operations.
  throttle("auth/ip", limit: 60, period: 1.minute) do |req|
    if req.path.start_with?("/users/", "/auth/", "/api/v1/api_key")
      req.ip
    end
  end

  # Push API: 120 req/min by API key
  # Higher limit accommodates `ax push --all` which sends many chunked requests
  # in parallel. The CLI handles 429s with Retry-After backoff as a safety net.
  throttle("push/api_key", limit: 120, period: 1.minute) do |req|
    if req.path == "/api/v1/push" && req.post?
      req.env["HTTP_AUTHORIZATION"]&.delete_prefix("Bearer ")
    end
  end

  # Webhooks: 120 req/min by IP
  # GitHub sends bursts during push events; 120/min accommodates normal usage.
  throttle("webhooks/ip", limit: 120, period: 1.minute) do |req|
    if req.path.start_with?("/webhooks/") && req.post?
      req.ip
    end
  end

  # Waitlist: 10 req/min by IP
  throttle("waitlist/ip", limit: 10, period: 1.minute) do |req|
    if req.path == "/waitlist" && req.post?
      req.ip
    end
  end

  # Global fallback: 300 req/min by IP
  # Applies to all requests (health checks are safelisted above).
  throttle("global/ip", limit: 300, period: 1.minute) do |req|
    req.ip
  end

  # --- Custom 429 response ---

  self.throttled_responder = lambda do |request|
    match_data = request.env["rack.attack.match_data"] || {}
    now = match_data[:epoch_time] || Time.now.to_i
    period = match_data[:period] || 60
    retry_after = (period - (now % period)).to_i

    headers = {
      "Content-Type" => "application/json",
      "Retry-After" => retry_after.to_s
    }

    body = {
      error: "Rate limit exceeded. Retry after #{retry_after} seconds.",
      retry_after: retry_after
    }.to_json

    [ 429, headers, [ body ] ]
  end
end
