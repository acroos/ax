class WebhooksController < ApplicationController
  def github
    unless valid_github_signature?
      return head :unauthorized
    end

    event_type = request.headers["X-GitHub-Event"]
    payload = request.raw_post

    ProcessGitHubWebhookJob.perform_later(event_type, payload)

    render json: { ok: true }
  end

  private

  def valid_github_signature?
    secret = ENV["AX_WEBHOOK_GITHUB_SECRET"]
    return true if secret.blank? # Allow unvalidated in development

    signature = request.headers["X-Hub-Signature-256"]
    return false if signature.blank?

    expected = "sha256=" + OpenSSL::HMAC.hexdigest(
      OpenSSL::Digest.new("sha256"),
      secret,
      request.raw_post
    )

    ActiveSupport::SecurityUtils.secure_compare(expected, signature)
  end
end
