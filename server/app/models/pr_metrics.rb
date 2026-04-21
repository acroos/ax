class PrMetrics < ApplicationRecord
  belongs_to :pr

  validates :pr_id, uniqueness: true

  # Rate fields (fractions, must be 0..1)
  validates :ci_success_rate, numericality: { in: 0..1 }, allow_nil: true
  validates :line_revisit_rate, numericality: { in: 0..1 }, allow_nil: true
  validates :cache_hit_rate, numericality: { in: 0..1 }, allow_nil: true
  validates :sidechain_rate, numericality: { in: 0..1 }, allow_nil: true

  # Ratio fields (can exceed 1, must be non-negative)
  validates :re_read_rate, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :autonomy_score, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  # Non-negative numeric fields
  validates :token_cost_usd, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  # Non-negative integer fields
  validates :iteration_depth, numericality: { greater_than_or_equal_to: 0, only_integer: true }, allow_nil: true
  validates :post_open_commits, numericality: { greater_than_or_equal_to: 0, only_integer: true }, allow_nil: true

  before_update :prevent_settled_github_update

  GITHUB_DERIVED_FIELDS = %w[
    post_open_commits line_revisit_rate
  ].freeze

  SESSION_DERIVED_FIELDS = %w[
    iteration_depth token_cost_usd
    cache_hit_rate sidechain_rate re_read_rate autonomy_score
  ].freeze

  def finalized?
    metrics_finalized?
  end

  # Update session-derived metrics, safe to call on settled PRs.
  def update_session_metrics!(attrs)
    safe_attrs = attrs.slice(*SESSION_DERIVED_FIELDS.map(&:to_sym))
    update!(safe_attrs)
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
