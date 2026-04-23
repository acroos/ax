class PrMetrics < ApplicationRecord
  belongs_to :pr

  validates :pr_id, uniqueness: true

  # Rate fields (fractions, must be 0..1)
  validates :ci_success_rate, numericality: { in: 0..1 }, allow_nil: true
  validates :line_revisit_rate, numericality: { in: 0..1 }, allow_nil: true

  # Non-negative integer fields
  validates :post_open_commits, numericality: { greater_than_or_equal_to: 0, only_integer: true }, allow_nil: true

  before_update :prevent_settled_github_update

  GITHUB_DERIVED_FIELDS = %w[
    post_open_commits line_revisit_rate
  ].freeze

  CI_DERIVED_FIELDS = %w[ci_success_rate].freeze

  def finalized?
    metrics_finalized?
  end

  # Parallel to the finalization guard for GitHub-derived fields: CI metrics
  # (ci_success_rate) must remain updatable after finalization because
  # check_suite webhooks and reconciliation jobs arrive after a PR is settled.
  # This method makes that bypass explicit and intentional, while still running
  # validations and touching updated_at.
  def update_ci_metrics!(attributes)
    unexpected = attributes.keys.map(&:to_s) - CI_DERIVED_FIELDS
    raise ArgumentError, "update_ci_metrics! only accepts CI-derived fields: #{unexpected.join(', ')}" if unexpected.any?

    update!(attributes)
  end

  private

  def prevent_settled_github_update
    return unless metrics_finalized_was && metrics_finalized

    github_changes = changed & GITHUB_DERIVED_FIELDS
    if github_changes.any?
      errors.add(:base, "Settled GitHub metrics cannot be updated: #{github_changes.join(', ')}")
      throw(:abort)
    end
  end
end
