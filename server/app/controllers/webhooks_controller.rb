class WebhooksController < ApplicationController
  def github
    unless valid_github_signature?
      return head :unauthorized
    end

    event_type = request.headers["X-GitHub-Event"]
    delivery_id = request.headers["X-GitHub-Delivery"]
    payload = request.raw_post

    ProcessGitHubWebhookJob.perform_later(event_type, payload, delivery_id)

    render json: { ok: true }
  end

  def stripe
    payload = request.raw_post
    sig_header = request.headers["Stripe-Signature"]

    begin
      event = Stripe::Webhook.construct_event(
        payload, sig_header, ENV.fetch("STRIPE_WEBHOOK_SECRET")
      )
    rescue JSON::ParserError, Stripe::SignatureVerificationError
      return head :bad_request
    end

    ProcessStripeWebhookJob.perform_later(event.type, event.data.object.to_json, event.id)
    render json: { ok: true }
  end

  private

  def valid_github_signature?
    secret = resolve_webhook_secret
    return Rails.env.development? if secret.blank?

    signature = request.headers["X-Hub-Signature-256"]
    return false if signature.blank?

    expected = "sha256=" + OpenSSL::HMAC.hexdigest(
      OpenSSL::Digest.new("sha256"),
      secret,
      request.raw_post
    )

    ActiveSupport::SecurityUtils.secure_compare(expected, signature)
  end

  def resolve_webhook_secret
    payload = JSON.parse(request.raw_post, symbolize_names: true) rescue {}
    installation_id = payload.dig(:installation, :id)

    if installation_id
      installation = GithubInstallation.find_by(github_installation_id: installation_id)
      return installation.webhook_secret if installation&.webhook_secret.present?
    end

    ENV["GITHUB_APP_WEBHOOK_SECRET"] || ENV["AX_WEBHOOK_GITHUB_SECRET"]
  end
end
